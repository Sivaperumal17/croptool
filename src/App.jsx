import { useState, useRef, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist/build/pdf';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument } from 'pdf-lib';
import './App.css';

// Configure pdfjs worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const CARD_TYPES = {
  custom: { label: 'Custom Crop', width: 0, height: 0 },
  aadhar: { label: 'Aadhaar Card', width: 745, height: 478 },
  pan: { label: 'PAN Card', width: 745, height: 478 },
  voter: { label: 'Voter ID', width: 745, height: 478 },
  eshram: { label: 'E-Shram / Health ID', width: 745, height: 478 },
  driving: { label: 'Driving License', width: 745, height: 478 },
  rcbook: { label: 'RC Book', width: 745, height: 478 },
  passport_photo: { label: 'Passport Size Photo', width: 350, height: 450 },
  large_1_3: { label: '1/3 A4 Size', width: 745, height: 1836 }
};

function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [activeTool, setActiveTool] = useState('pdf'); // 'pdf' or 'photo'
  
  // PDF State
  const [file, setFile] = useState(null);
  const [originalBytes, setOriginalBytes] = useState(null);
  const [pdfPage, setPdfPage] = useState(null);
  const [viewport, setViewport] = useState(null);
  const [selectedCard, setSelectedCard] = useState('custom');
  
  // Crop coordinates state
  const [cropStart, setCropStart] = useState({ x: 0, y: 0 });
  const [cropEnd, setCropEnd] = useState({ x: 0, y: 0 });
  const [isDrawing, setIsDrawing] = useState(false);

  const pdfCanvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const cropCanvasRef = useRef(null);

  // Photo State
  const [photoData, setPhotoData] = useState(null);
  const [photoSize, setPhotoSize] = useState('passport'); // 'passport' or 'stamp'
  const [photoCount, setPhotoCount] = useState(8);

  const handleSizeChange = (e) => {
    const newSize = e.target.value;
    setPhotoSize(newSize);
    setPhotoCount(newSize === 'passport' ? 8 : 32);
  };

  // Splash Screen Timer
  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2500);
    return () => clearTimeout(timer);
  }, []);

  // Load PDF when file changes
  useEffect(() => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const typedarray = new Uint8Array(e.target.result);
      setOriginalBytes(typedarray.slice());
      
      const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
      const page = await pdf.getPage(1);
      const vp = page.getViewport({ scale: 3 });
      
      setPdfPage(page);
      setViewport(vp);

      const canvas = pdfCanvasRef.current;
      const overlay = overlayCanvasRef.current;
      if (canvas && overlay) {
        canvas.width = vp.width;
        canvas.height = vp.height;
        overlay.width = vp.width;
        overlay.height = vp.height;

        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        
        const oCtx = overlay.getContext('2d');
        oCtx.clearRect(0, 0, overlay.width, overlay.height);
      }
    };
    reader.readAsArrayBuffer(file);
  }, [file]);

  const drawOverlay = (sx, sy, ex, ey) => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    
    const x = Math.min(sx, ex);
    const y = Math.min(sy, ey);
    const w = Math.abs(ex - sx);
    const h = Math.abs(ey - sy);

    ctx.strokeStyle = '#a855f7'; // Neon purple for dark mode
    ctx.lineWidth = 3;
    ctx.setLineDash([5]);
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = 'rgba(168, 85, 247, 0.15)';
    ctx.fillRect(x, y, w, h);
  };

  const handleMouseDown = (e) => {
    if (!pdfPage) return;
    const rect = overlayCanvasRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    
    setIsDrawing(true);
    setCropStart({ x: sx, y: sy });

    if (selectedCard !== 'custom') {
      const { width, height } = CARD_TYPES[selectedCard];
      const ex = Math.min(sx + width, overlayCanvasRef.current.width);
      const ey = Math.min(sy + height, overlayCanvasRef.current.height);
      setCropEnd({ x: ex, y: ey });
      drawOverlay(sx, sy, ex, ey);
      setIsDrawing(false);
    } else {
      setCropEnd({ x: sx, y: sy }); // Initialize end to start
    }
  };

  const handleMouseMove = (e) => {
    if (!isDrawing || selectedCard !== 'custom') return;
    const rect = overlayCanvasRef.current.getBoundingClientRect();
    const ex = e.clientX - rect.left;
    const ey = e.clientY - rect.top;
    setCropEnd({ x: ex, y: ey });
    drawOverlay(cropStart.x, cropStart.y, ex, ey);
  };

  const handleMouseUp = () => {
    if (selectedCard === 'custom') setIsDrawing(false);
  };

  const downloadPDF = async () => {
    if (!originalBytes) return alert('No PDF loaded');
    if (cropStart.x === cropEnd.x) return alert('Please draw a crop box');

    const x = Math.min(cropStart.x, cropEnd.x);
    const y = Math.min(cropStart.y, cropEnd.y);
    const w = Math.abs(cropEnd.x - cropStart.x);
    const h = Math.abs(cropEnd.y - cropStart.y);

    const scale = viewport.scale;
    const pdfW = pdfPage.view[2];
    const pdfH = pdfPage.view[3];

    const uX = x / scale;
    const uY = y / scale;
    const uW = w / scale;
    const uH = h / scale;

    const pdfCropX = uX;
    const pdfCropY = pdfH - uY - uH;

    try {
      const pdfDoc = await PDFDocument.load(originalBytes);
      const firstPage = pdfDoc.getPages()[0];
      firstPage.setCropBox(pdfCropX, pdfCropY, uW, uH);
      const pdfBytes = await pdfDoc.save();
      
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'cropped-hq.pdf';
      link.click();
    } catch (err) {
      console.error(err);
      alert('Error saving PDF');
    }
  };

  const getCropImageData = () => {
    if (cropStart.x === cropEnd.x) {
      alert('Please draw or select a crop box first.');
      return null;
    }
    const x = Math.min(cropStart.x, cropEnd.x);
    const y = Math.min(cropStart.y, cropEnd.y);
    const w = Math.abs(cropEnd.x - cropStart.x);
    const h = Math.abs(cropEnd.y - cropStart.y);

    const canvas = cropCanvasRef.current;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(pdfCanvasRef.current, x, y, w, h, 0, 0, w, h);
    return canvas.toDataURL('image/png');
  };

  const downloadImage = () => {
    const imgData = getCropImageData();
    if (!imgData) return;
    const link = document.createElement('a');
    link.href = imgData;
    link.download = 'cropped-image.png';
    link.click();
  };

  const printPVC = (side) => {
    const imgData = getCropImageData();
    if (!imgData) return;

    const win = window.open("");
    win.document.write(`
      <html>
        <head>
          <title>Print 4x6 Portrait ${side === 'front' ? '' : '- Flipped'}</title>
          <style>
            @page { size: 4in 6in; margin: 0in; }
            @media print {
              body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: flex-start; height: 6in; }
              .container { width: calc(100% - 40px); height: 100%; display: flex; justify-content: center; align-items: flex-start; padding-top: 5px; box-sizing: border-box; }
              img { width: 100%; height: auto; }
            }
            body { margin: 0; padding: 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <img src="${imgData}" onload="setTimeout(() => { window.print(); window.close(); }, 300)">
          </div>
        </body>
      </html>
    `);
    win.document.close();
  };

  const handlePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setPhotoData(event.target.result);
    };
    reader.readAsDataURL(file);
  };

  const printPassportPhoto = () => {
    if (!photoData) return;
    const win = window.open("", "_blank");
    
    const isPassport = photoSize === 'passport';
    const imgWidth = isPassport ? '35mm' : '17mm';
    const imgHeight = isPassport ? '45mm' : '22mm';
    const cols = isPassport ? 4 : 8;
    const rows = isPassport ? 2 : 4;
    const maxPhotos = cols * rows;
    const count = Math.min(Number(photoCount), maxPhotos); 

    win.document.write(`
      <html>
        <head>
          <title>Print Photos</title>
          <style>
            @page { size: 152.4mm 101.6mm; margin: 0; }
            html, body { width: 152.4mm; height: 101.6mm; margin: 0; padding: 0; background: white; }
            .photo-grid {
              display: grid;
              grid-auto-flow: column;
              grid-template-columns: repeat(${cols}, ${imgWidth});
              grid-template-rows: repeat(${rows}, ${imgHeight});
              column-gap: ${isPassport ? '3mm' : '2mm'};
              row-gap: ${isPassport ? '5mm' : '3mm'};
              width: 100%;
              height: 100%;
              justify-content: center;
              align-content: center;
              box-sizing: border-box;
            }
            .photo-grid img {
              width: 100%;
              height: 100%;
              object-fit: cover;
              border: 1px solid #aaa;
              box-sizing: border-box;
            }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="photo-grid">
            ${Array(count).fill(`<img src="${photoData}" alt="Photo">`).join('')}
          </div>
        </body>
      </html>
    `);
    win.document.close();
  };

  if (showSplash) {
    return (
      <div className="splash-screen">
        <div className="splash-logo-container">
          <div className="splash-logo-ring"></div>
          <img src="/logo.png" alt="Logo" className="splash-logo" />
        </div>
        <h1 className="splash-title">Xerox Pro Workspace</h1>
        <p className="splash-subtitle">Loading premium environment...</p>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="header">
        <h1>Premium Document Cropping & Printing</h1>
        
        <div className="tool-switcher">
          <button 
            className={`switch-btn ${activeTool === 'pdf' ? 'active' : ''}`}
            onClick={() => setActiveTool('pdf')}
          >
            📄 PDF Tool
          </button>
          <button 
            className={`switch-btn ${activeTool === 'photo' ? 'active' : ''}`}
            onClick={() => setActiveTool('photo')}
          >
            📷 Photo Tool
          </button>
        </div>
      </header>

      {activeTool === 'pdf' ? (
      <div className="dashboard">
        <aside className="sidebar">
          <div className="card controls-card">
            <h2>1. Document</h2>
            <label className="file-upload">
              <input 
                type="file" 
                accept="application/pdf" 
                onClick={(e) => (e.target.value = null)}
                onChange={e => {
                  if (e.target.files[0]) {
                    setFile(e.target.files[0]);
                  }
                }} 
              />
              <div className="upload-btn">
                <span>{file ? file.name : 'Upload PDF'}</span>
              </div>
            </label>
          </div>

          <div className="card controls-card">
            <h2>2. Card Type</h2>
            <label className="card-select">
              <select 
                value={selectedCard} 
                onChange={e => setSelectedCard(e.target.value)}
                className="sleek-dropdown"
              >
                {Object.entries(CARD_TYPES).map(([key, data]) => (
                  <option key={key} value={key}>{data.label}</option>
                ))}
              </select>
            </label>
            <p className="hint">
              {selectedCard === 'custom' 
                ? 'Click and drag to draw a custom area.' 
                : 'Click once on the canvas to place the exact card size.'}
            </p>
          </div>

          <div className="card controls-card">
            <h2>3. Actions</h2>
            <div className="actions-grid">
              <button className="btn btn-primary" onClick={() => printPVC('front')}>
                Print Front (PVC)
              </button>
              <button className="btn btn-primary" onClick={() => printPVC('back')}>
                Print Back (PVC)
              </button>
              <button className="btn btn-accent" onClick={downloadPDF}>
                Download PDF (HQ)
              </button>
              <button className="btn btn-outline" onClick={downloadImage}>
                Download Image
              </button>
            </div>
          </div>
        </aside>

        <main className="workspace">
          {!file && (
            <div className="empty-state">
              <p>Please upload a PDF document to begin.</p>
            </div>
          )}
          
          <div className="canvas-wrapper" style={{ display: file ? 'block' : 'none' }}>
            <canvas ref={pdfCanvasRef} id="pdf-layer"></canvas>
            <canvas 
              ref={overlayCanvasRef} 
              id="overlay-layer"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            ></canvas>
          </div>
        </main>
      </div>
      ) : (
      <div className="dashboard">
        <aside className="sidebar">
          <div className="card controls-card">
            <h2>1. Photo Document</h2>
            <label className="file-upload">
              <input type="file" accept="image/*" onChange={handlePhotoUpload} />
              <div className="upload-btn">
                <span>{photoData ? 'Change Photo' : 'Upload Image'}</span>
              </div>
            </label>
          </div>

          <div className="card controls-card">
            <h2>2. Photo Settings</h2>
            <div style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
              <div>
                <label style={{display: 'block', marginBottom: '8px', color: 'var(--text-muted)'}}>Photo Size</label>
                <select 
                  className="sleek-dropdown" 
                  value={photoSize} 
                  onChange={handleSizeChange}
                >
                  <option value="passport">Passport Size</option>
                  <option value="stamp">Stamp Size</option>
                </select>
              </div>
              <div>
                <label style={{display: 'block', marginBottom: '8px', color: 'var(--text-muted)'}}>Number of Copies</label>
                <input 
                  type="number" 
                  className="sleek-dropdown" 
                  style={{width: '100%', boxSizing: 'border-box'}} 
                  value={photoCount} 
                  onChange={e => {
                    const val = e.target.value;
                    if (val === '') {
                      setPhotoCount('');
                    } else {
                      setPhotoCount(Math.max(1, parseInt(val)));
                    }
                  }} 
                  min="1" 
                  max="40" 
                />
              </div>
            </div>
          </div>

          <div className="card controls-card">
            <h2>3. Actions</h2>
            <div className="actions-grid">
              <button className="btn btn-accent" onClick={printPassportPhoto} disabled={!photoData}>
                Print Photos
              </button>
            </div>
          </div>
        </aside>
        <main className="workspace">
          {!photoData ? (
             <div className="empty-state">
               <p>Please upload an image to begin.</p>
             </div>
          ) : (
             <div style={{
                width: '100%', 
                maxWidth: '600px', 
                aspectRatio: '152.4 / 101.6', 
                backgroundColor: 'white',
                boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
                display: 'grid',
                gridAutoFlow: 'column',
                gridTemplateColumns: `repeat(${photoSize === 'passport' ? 4 : 8}, ${photoSize === 'passport' ? (35 / 152.4 * 100) : (17 / 152.4 * 100)}%)`,
                gridTemplateRows: `repeat(${photoSize === 'passport' ? 2 : 4}, ${photoSize === 'passport' ? (45 / 101.6 * 100) : (22 / 101.6 * 100)}%)`,
                columnGap: `${photoSize === 'passport' ? (3 / 152.4 * 100) : (2 / 152.4 * 100)}%`,
                rowGap: `${photoSize === 'passport' ? (5 / 101.6 * 100) : (3 / 101.6 * 100)}%`,
                boxSizing: 'border-box',
                justifyContent: 'center',
                alignContent: 'center'
             }}>
                {Array(Math.min(Number(photoCount), photoSize === 'passport' ? 8 : 32)).fill(0).map((_, i) => (
                  <img 
                    key={i} 
                    src={photoData} 
                    alt={`Photo ${i}`} 
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      border: '1px solid #aaa',
                      boxSizing: 'border-box'
                    }}
                  />
                ))}
             </div>
          )}
        </main>
      </div>
      )}

      {/* Hidden canvas for image cropping extraction */}
      <canvas ref={cropCanvasRef} style={{ display: 'none' }}></canvas>
    </div>
  );
}

export default App;
