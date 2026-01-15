import React, { useState, useRef, useEffect } from 'react';
import { Plus, ArrowRight, Move, Trash2, Eraser, MousePointer2, Download, Save, Upload, X, Palette, Activity } from 'lucide-react';

// Palette colori nodi
const NODE_COLORS = [
  { id: 'white', class: 'bg-white', label: 'Bianco' },
  { id: 'blue', class: 'bg-blue-100', label: 'Blu' },
  { id: 'green', class: 'bg-green-100', label: 'Verde' },
  { id: 'yellow', class: 'bg-yellow-100', label: 'Giallo' },
  { id: 'red', class: 'bg-red-100', label: 'Rosso' },
  { id: 'purple', class: 'bg-purple-100', label: 'Viola' },
  { id: 'orange', class: 'bg-orange-100', label: 'Arancio' },
];

// Stili delle linee di collegamento
const EDGE_STYLES = [
  { id: 'solid', label: 'Continua', dash: '' },
  { id: 'dashed', label: 'Tratteggiata', dash: '5,5' },
  { id: 'dotted', label: 'Puntinata', dash: '2,2' },
];

// --- Helper per generare ID univoci compatibili con tutti i browser ---
const makeId = () => {
  return 'id-' + Math.random().toString(36).substr(2, 9);
};

const ProcessEditor = () => {
  // --- Stati principali ---
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [mode, setMode] = useState('pointer'); // 'pointer', 'node', 'edge'

  // --- Viewport (Zoom e Pan) ---
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // --- Selezione ---
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);

  // --- Interazione Mouse ---
  const [linkingSourceId, setLinkingSourceId] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isDraggingNode, setIsDraggingNode] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // --- Opzioni ---
  const [autoConnect, setAutoConnect] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  // --- Riferimenti ---
  const canvasRef = useRef(null);
  const contentRef = useRef(null); // Ref specifico per il contenuto da esportare
  const fileInputRef = useRef(null);
  const hasMovedRef = useRef(false);

  // --- Caricamento libreria per screenshot (html2canvas) ---
  useEffect(() => {
    const script = document.createElement('script');
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
    script.async = true;
    document.body.appendChild(script);
    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  // --- Gestione Salvataggio/Caricamento Progetto (JSON) ---
  const handleSaveProject = () => {
    const projectData = {
      version: 3,
      nodes: nodes,
      edges: edges,
      viewport: viewport
    };

    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `progetto_processo_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleLoadProject = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (Array.isArray(data.nodes) && Array.isArray(data.edges)) {
          setNodes(data.nodes);
          setEdges(data.edges.map(e => ({
              ...e,
              style: e.style || 'solid',
              text: e.text || '',
              isEditing: false
          })));

          if (data.viewport) {
             setViewport(data.viewport);
          }
          setSelectedNodeId(null);
          setSelectedEdgeId(null);
        } else {
          console.error("Il file selezionato non sembra essere un progetto valido.");
        }
      } catch (err) {
        console.error(err);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleClearAll = () => {
    if (confirmClear) {
        setNodes([]);
        setEdges([]);
        setConfirmClear(false);
    } else {
        setConfirmClear(true);
        setTimeout(() => setConfirmClear(false), 3000);
    }
  };

  // --- Funzione Esportazione Migliorata ---
  const handleDownload = async () => {
    if (!window.html2canvas) {
        console.warn("Modulo esportazione non ancora caricato");
        return;
    }
    if (nodes.length === 0) {
        alert("Aggiungi almeno un blocco per esportare.");
        return;
    }

    setIsExporting(true);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);

    // 1. Calcola il bounding box (l'area che contiene tutti i nodi)
    const xs = nodes.map(n => n.x);
    const ys = nodes.map(n => n.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs) + 140; // + larghezza nodo
    const maxY = Math.max(...ys) + 50;  // + altezza nodo

    const graphWidth = maxX - minX;
    const graphHeight = maxY - minY;
    const padding = 50;

    // Dimensioni totali necessarie per l'immagine
    const totalWidth = graphWidth + (padding * 2);
    const totalHeight = graphHeight + (padding * 2);

    // 2. Salva il viewport attuale dell'utente
    const originalViewport = { ...viewport };

    // 3. Resetta lo zoom a 1 e sposta la vista per inquadrare perfettamente il grafico
    // Impostiamo l'origine (x,y) in modo che il nodo più in alto a sinistra vada a (padding, padding)
    setViewport({
        zoom: 1,
        x: -minX + padding,
        y: -minY + padding
    });

    // Attendi che React renderizzi il nuovo viewport
    setTimeout(async () => {
        try {
            // Cattura specificamente il contentRef
            const canvasElement = await window.html2canvas(contentRef.current, {
                backgroundColor: '#f8fafc', // Colore sfondo
                scale: 2, // Aumenta risoluzione (es. Retina)
                logging: false,
                useCORS: true,
                // Forza le dimensioni del canvas di output
                width: totalWidth,
                height: totalHeight,
                windowWidth: totalWidth,
                windowHeight: totalHeight,
                x: 0,
                y: 0,
                scrollX: 0,
                scrollY: 0,
                onclone: (clonedDoc) => {
                    // FIX CRITICO PER IL TAGLIO:
                    // Ridimensiona forzatamente il contenitore nel DOM clonato per contenere tutto il grafico.
                    // Se il grafico è 3000px ma lo schermo è 1920px, questo assicura che html2canvas "veda" tutti i 3000px.
                    const exportContainer = clonedDoc.getElementById('export-container');
                    const wrapper = exportContainer?.parentElement; // Il div padre (quello con canvasRef)

                    if (exportContainer && wrapper) {
                        // Allarga il wrapper
                        wrapper.style.width = `${totalWidth}px`;
                        wrapper.style.height = `${totalHeight}px`;
                        wrapper.style.overflow = 'visible'; // Importante!

                        // Allarga il contenitore interno
                        exportContainer.style.width = `${totalWidth}px`;
                        exportContainer.style.height = `${totalHeight}px`;

                        // Nota: Non tocchiamo il transform qui perché ci fidiamo che React
                        // abbia aggiornato lo stato viewport correttamente prima dello snapshot.
                    }
                }
            });

            const link = document.createElement('a');
            link.download = `processo_snapshot_${new Date().toISOString().slice(0,10)}.png`;
            link.href = canvasElement.toDataURL('image/png');
            link.click();
        } catch (err) {
            console.error("Export fallito:", err);
            alert("Errore durante l'esportazione dell'immagine.");
        } finally {
            // 4. Ripristina la vista originale dell'utente
            setViewport(originalViewport);
            setIsExporting(false);
        }
    }, 200); // Tempo leggermente aumentato per permettere il rendering del DOM
  };

  // --- Helper Coordinate ---
  const screenToWorld = (screenX, screenY) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (screenX - rect.left - viewport.x) / viewport.zoom,
      y: (screenY - rect.top - viewport.y) / viewport.zoom
    };
  };

  // --- Gestione Nodi ---
  const addNode = (worldX, worldY) => {
    const newNode = {
      id: makeId(),
      x: worldX - 70,
      y: worldY - 25,
      text: "Nuovo Step",
      color: 'bg-white',
      isEditing: true
    };

    setNodes(prev => [...prev, newNode]);

    if (autoConnect && selectedNodeId) {
      addEdge(selectedNodeId, newNode.id);
    }

    setSelectedNodeId(newNode.id);
    setSelectedEdgeId(null);
  };

  const updateNodePosition = (id, x, y) => {
    setNodes(nodes.map(n => n.id === id ? { ...n, x, y } : n));
  };

  const updateNodeText = (id, newText) => {
    setNodes(prev => prev.map(n =>
      n.id === id ? { ...n, text: newText || "Step", isEditing: false } : n
    ));
  };

  const updateNodeColor = (id, newColorClass) => {
    setNodes(prev => prev.map(n =>
        n.id === id ? { ...n, color: newColorClass } : n
    ));
  };

  const startEditingNode = (id) => {
    setNodes(prev => prev.map(n =>
      n.id === id ? { ...n, isEditing: true } : n
    ));
  };

  const deleteNode = (id) => {
    setNodes(nodes.filter(n => n.id !== id));
    setEdges(edges.filter(e => e.from !== id && e.to !== id));
    if (selectedNodeId === id) setSelectedNodeId(null);
  };

  // --- Gestione Link (Edges) ---
  const addEdge = (fromId, toId) => {
    if (fromId === toId) return;
    const exists = edges.some(e => e.from === fromId && e.to === toId);
    if (!exists) {
      setEdges(prev => [...prev, {
        id: makeId(),
        from: fromId,
        to: toId,
        style: 'solid',
        text: '',
        isEditing: false
      }]);
    }
  };

  const updateEdgeStyle = (id, newStyle) => {
    setEdges(prev => prev.map(e =>
        e.id === id ? { ...e, style: newStyle } : e
    ));
  };

  const updateEdgeText = (id, text) => {
    setEdges(prev => prev.map(e =>
        e.id === id ? { ...e, text, isEditing: false } : e
    ));
  };

  const startEditingEdge = (id) => {
    setEdges(prev => prev.map(e =>
        e.id === id ? { ...e, isEditing: true } : e
    ));
  };

  const deleteEdge = (id) => {
    setEdges(edges.filter(e => e.id !== id));
    if (selectedEdgeId === id) setSelectedEdgeId(null);
  };

  const handleDeleteSelected = () => {
    if (selectedNodeId) deleteNode(selectedNodeId);
    if (selectedEdgeId) deleteEdge(selectedEdgeId);
  };

  // --- Gestione Eventi Canvas ---
  const handleWheel = (e) => {
    e.preventDefault();
    if (e.ctrlKey) return;

    const zoomSensitivity = 0.001;
    const minZoom = 0.1;
    const maxZoom = 3;

    const delta = -e.deltaY * zoomSensitivity;
    const newZoom = Math.min(Math.max(viewport.zoom + delta * 2, minZoom), maxZoom);

    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const worldX = (mouseX - viewport.x) / viewport.zoom;
    const worldY = (mouseY - viewport.y) / viewport.zoom;

    const newPanX = mouseX - worldX * newZoom;
    const newPanY = mouseY - worldY * newZoom;

    setViewport({ x: newPanX, y: newPanY, zoom: newZoom });
  };

  const handleCanvasMouseDown = (e) => {
    if (!hoveredNodeId) {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
      hasMovedRef.current = false;
    }
  };

  const handleCanvasMouseMove = (e) => {
    const worldPos = screenToWorld(e.clientX, e.clientY);
    setMousePos(worldPos);

    if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        hasMovedRef.current = true;
      }

      setViewport(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
      setPanStart({ x: e.clientX, y: e.clientY });
      return;
    }

    if (isDraggingNode && selectedNodeId && mode === 'pointer') {
      updateNodePosition(selectedNodeId, worldPos.x - dragOffset.x, worldPos.y - dragOffset.y);
    }
  };

  const handleCanvasMouseUp = (e) => {
    if (isPanning) {
      setIsPanning(false);

      if (!hasMovedRef.current) {
        if (mode === 'node') {
          const worldPos = screenToWorld(e.clientX, e.clientY);
          addNode(worldPos.x, worldPos.y);
        } else if (mode === 'pointer') {
          setSelectedNodeId(null);
          setSelectedEdgeId(null);
        }
      }
    }
  };

  const handleNodeMouseDown = (e, nodeId) => {
    e.stopPropagation();

    if (mode === 'edge') {
      setLinkingSourceId(nodeId);
    } else if (mode === 'pointer') {
      const worldPos = screenToWorld(e.clientX, e.clientY);
      const node = nodes.find(n => n.id === nodeId);

      setSelectedNodeId(nodeId);
      setSelectedEdgeId(null);
      setIsDraggingNode(true);

      setDragOffset({ x: worldPos.x - node.x, y: worldPos.y - node.y });
    } else if (mode === 'node') {
        setSelectedNodeId(nodeId);
        setSelectedEdgeId(null);
    }
  };

  const handleNodeMouseUp = (e, nodeId) => {
    e.stopPropagation();

    if (mode === 'edge' && linkingSourceId) {
      addEdge(linkingSourceId, nodeId);
      setLinkingSourceId(null);
    }
    setIsDraggingNode(false);
  };

  useEffect(() => {
    const handleUp = () => {
      setIsDraggingNode(false);
      setIsPanning(false);
      setLinkingSourceId(null);
    };
    window.addEventListener('mouseup', handleUp);
    return () => window.removeEventListener('mouseup', handleUp);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
        if (e.target.tagName === 'INPUT') return;
        if (e.key === 'Delete' || e.key === 'Backspace') {
            handleDeleteSelected();
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId, selectedEdgeId, nodes, edges]);

  // --- Helper per calcolare coordinate ---
  const getEdgeMetrics = (edge) => {
      const fromNode = nodes.find(n => n.id === edge.from);
      const toNode = nodes.find(n => n.id === edge.to);
      if (!fromNode || !toNode) return null;

      const start = { x: fromNode.x + 70, y: fromNode.y + 25 };
      const endRaw = { x: toNode.x + 70, y: toNode.y + 25 };

      // Calcolo freccia
      const angle = Math.atan2(endRaw.y - start.y, endRaw.x - start.x);
      const radius = 0; // Distanza dal centro target, se si vuole offset
      const endX = endRaw.x - radius * Math.cos(angle);
      const endY = endRaw.y - radius * Math.sin(angle);

      const arrowLen = 10;
      const arrowAngle = Math.PI / 6;

      const p1x = endX - arrowLen * Math.cos(angle - arrowAngle);
      const p1y = endY - arrowLen * Math.sin(angle - arrowAngle);

      const p2x = endX - arrowLen * Math.cos(angle + arrowAngle);
      const p2y = endY - arrowLen * Math.sin(angle + arrowAngle);

      const midX = (start.x + endX) / 2;
      const midY = (start.y + endY) / 2;

      return {
          start,
          end: { x: endX, y: endY },
          arrowPoly: `${endX},${endY} ${p1x},${p1y} ${p2x},${p2y}`,
          mid: { x: midX, y: midY }
      };
  };

  // --- Rendering SVG (Linee) ---
  const renderEdgeLine = (edge) => {
    const metrics = getEdgeMetrics(edge);
    if (!metrics) return null;

    const { start, end, arrowPoly } = metrics;
    const isSelected = selectedEdgeId === edge.id;
    const strokeColor = isSelected ? "#6366f1" : "#94a3b8";
    const styleObj = EDGE_STYLES.find(s => s.id === edge.style) || EDGE_STYLES[0];

    return (
      <g
        key={edge.id}
        onClick={(e) => {
            e.stopPropagation();
            if (mode === 'pointer') {
                setSelectedEdgeId(edge.id);
                setSelectedNodeId(null);
            }
        }}
        onDoubleClick={(e) => {
            e.stopPropagation();
            startEditingEdge(edge.id);
        }}
        className={`pointer-events-auto ${mode === 'pointer' ? 'cursor-pointer' : ''}`}
      >
        {/* Area di click allargata */}
        <path
            d={`M ${start.x} ${start.y} L ${end.x} ${end.y}`}
            stroke="transparent"
            strokeWidth="20"
        />

        {/* Linea visibile */}
        <path
          d={`M ${start.x} ${start.y} L ${end.x} ${end.y}`}
          stroke={strokeColor}
          strokeWidth={isSelected ? "3" : "2"}
          strokeDasharray={styleObj.dash}
        />

        {/* Freccia */}
        <polygon
            points={arrowPoly}
            fill={strokeColor}
        />
      </g>
    );
  };

  // --- Rendering HTML (Overlay: Testi e Pulsanti Delete) ---
  const renderEdgeOverlay = (edge) => {
    const metrics = getEdgeMetrics(edge);
    if (!metrics) return null;
    const { mid } = metrics;
    const isSelected = selectedEdgeId === edge.id;

    // Se non c'è testo e non è selezionato e non si sta editando, non mostrare nulla
    if (!edge.text && !edge.isEditing && !isSelected) return null;

    return (
        <div
            key={`overlay-${edge.id}`}
            style={{
                position: 'absolute',
                left: mid.x,
                top: mid.y,
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none' // Il contenitore non blocca i click, i figli sì
            }}
            className="flex flex-col items-center justify-center z-20" // AUMENTATO Z-INDEX A 20 PER ESSERE SOPRA LE LINEE
        >
            {/* Casella di Testo / Label */}
            {(edge.text || edge.isEditing) && (
                <div
                    className="pointer-events-auto mb-1"
                    onDoubleClick={(e) => {
                        e.stopPropagation();
                        startEditingEdge(edge.id);
                    }}
                >
                    {edge.isEditing && !isExporting ? (
                        <input
                            autoFocus
                            type="text"
                            defaultValue={edge.text}
                            onBlur={(e) => updateEdgeText(edge.id, e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') updateEdgeText(edge.id, e.currentTarget.value); }}
                            className="text-xs text-center p-1 border border-indigo-500 rounded bg-white shadow-sm outline-none min-w-[60px]"
                            onMouseDown={(e) => e.stopPropagation()}
                        />
                    ) : (
                        // UPDATE: Stile inline per transform per offset export
                        <div className="bg-white/90 backdrop-blur-sm px-2 py-0.5 rounded border border-slate-200 shadow-sm cursor-pointer hover:border-indigo-300 whitespace-nowrap flex items-center justify-center">
                            <span
                                className="text-xs font-medium text-slate-600 leading-none"
                                style={{ transform: isExporting ? 'translateY(-5px)' : 'none' }}
                            >
                                {edge.text}
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* Pulsante Elimina (spostato qui dall'SVG) */}
            {isSelected && !isExporting && (
                <div
                    className="pointer-events-auto cursor-pointer mt-1 relative z-50"
                    onMouseDown={(e) => e.stopPropagation()} // FIX CRITICO: Ferma mousedown per evitare conflitti con pan
                    onClick={(e) => {
                        e.stopPropagation();
                        deleteEdge(edge.id);
                    }}
                >
                    <div className="bg-red-500 text-white rounded-full p-1 hover:bg-red-600 shadow transition-transform hover:scale-110 flex items-center justify-center w-5 h-5">
                        <X size={12} strokeWidth={3} />
                    </div>
                </div>
            )}
        </div>
    );
  };

  const renderTempLine = () => {
    if (mode === 'edge' && linkingSourceId) {
      const fromNode = nodes.find(n => n.id === linkingSourceId);
      if (!fromNode) return null;
      const start = { x: fromNode.x + 70, y: fromNode.y + 25 };
      return (
        <path
          d={`M ${start.x} ${start.y} L ${mousePos.x} ${mousePos.y}`}
          stroke="#3b82f6" strokeWidth="2" strokeDasharray="5,5" pointerEvents="none"
        />
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-800 font-sans overflow-hidden">
      {/* Header */}
      <div className="ui-ignore-export bg-white border-b border-slate-200 p-4 shadow-sm flex flex-wrap items-center justify-between gap-4 z-20 relative">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 text-white p-2 rounded-lg"><Move size={20} /></div>
          <h1 className="text-xl font-bold text-slate-800 hidden md:block">Process Builder</h1>
        </div>
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg">
            <ToolButton active={mode === 'pointer'} onClick={() => setMode('pointer')} icon={<MousePointer2 size={18}/>} label="Sposta" />
            <ToolButton active={mode === 'node'} onClick={() => setMode('node')} icon={<Plus size={18}/>} label="Aggiungi" />
            <ToolButton active={mode === 'edge'} onClick={() => setMode('edge')} icon={<ArrowRight size={18}/>} label="Collega" />
        </div>
        <div className="flex items-center gap-2">
            <div className="text-xs text-slate-400 font-mono hidden xl:block mr-2">
                Zoom: {(viewport.zoom * 100).toFixed(0)}%
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none mx-2 bg-slate-50 p-1 px-2 rounded border border-slate-200">
                <input
                    type="checkbox"
                    checked={autoConnect}
                    onChange={(e) => setAutoConnect(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                />
                <span className="hidden md:inline">Auto-collega</span>
            </label>

            {/* SEZIONE COLORI NODI */}
            {selectedNodeId && (
                <div className="flex items-center gap-1 border-l border-r border-slate-200 px-3 mx-1 animate-in fade-in zoom-in duration-200">
                    <Palette size={16} className="text-slate-400 mr-1" />
                    {NODE_COLORS.map(color => (
                        <button
                            key={color.id}
                            onClick={() => updateNodeColor(selectedNodeId, color.class)}
                            className={`w-5 h-5 rounded-full border border-slate-300 ${color.class} hover:scale-125 transition-transform shadow-sm`}
                            title={color.label}
                        />
                    ))}
                </div>
            )}

            {/* SEZIONE STILI LINEE */}
            {selectedEdgeId && (
                <div className="flex items-center gap-1 border-l border-r border-slate-200 px-3 mx-1 animate-in fade-in zoom-in duration-200">
                    <Activity size={16} className="text-slate-400 mr-1" />
                    {EDGE_STYLES.map(style => (
                        <button
                            key={style.id}
                            onClick={() => updateEdgeStyle(selectedEdgeId, style.id)}
                            className={`w-8 h-8 flex items-center justify-center rounded hover:bg-slate-100 border border-slate-200 transition-colors
                                ${edges.find(e => e.id === selectedEdgeId)?.style === style.id ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-200' : 'bg-white'}
                            `}
                            title={style.label}
                        >
                            <svg width="20" height="2" overflow="visible">
                                <line
                                    x1="0" y1="1" x2="20" y2="1"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeDasharray={style.dash === '5,5' ? '4,2' : style.dash === '2,2' ? '1,2' : ''}
                                    className="text-slate-700"
                                />
                            </svg>
                        </button>
                    ))}
                </div>
            )}

            {/* Tasto Cancella Selezione */}
            {(selectedNodeId || selectedEdgeId) && (
                <button
                    onClick={handleDeleteSelected}
                    className="bg-red-100 text-red-600 hover:bg-red-200 p-2 rounded transition-colors mr-2"
                    title="Elimina Selezionato"
                >
                    <Trash2 size={18} />
                </button>
            )}

            <input
                type="file"
                ref={fileInputRef}
                onChange={handleLoadProject}
                accept=".json"
                className="hidden"
            />

            <button
                onClick={() => fileInputRef.current.click()}
                className="text-slate-600 hover:bg-slate-100 p-2 rounded transition-colors flex items-center gap-1"
                title="Carica Progetto"
            >
                <Upload size={18} />
            </button>

            <button
                onClick={handleSaveProject}
                className="text-slate-600 hover:bg-slate-100 p-2 rounded transition-colors flex items-center gap-1"
                title="Salva Progetto"
            >
                <Save size={18} />
            </button>

            <div className="h-6 w-px bg-slate-300 mx-1"></div>

            <button
                onClick={handleClearAll}
                className={`p-2 rounded transition-all flex items-center gap-1
                    ${confirmClear ? 'bg-red-500 text-white shadow-inner' : 'text-red-500 hover:bg-red-50'}
                `}
                title={confirmClear ? "Clicca di nuovo per confermare" : "Pulisci tutto"}
            >
                {confirmClear ? (
                    <span className="text-xs font-bold px-1 whitespace-nowrap animate-pulse">Sicuro?</span>
                ) : (
                    <Eraser size={20} />
                )}
            </button>

            <button
                onClick={handleDownload}
                disabled={isExporting}
                className="bg-slate-800 hover:bg-slate-700 text-white p-2 rounded flex items-center gap-2 text-sm font-medium transition-colors ml-2"
                title="Salva come Immagine"
            >
                <Download size={18} />
                <span className="hidden sm:inline">{isExporting ? '...' : 'Foto'}</span>
            </button>
        </div>
      </div>

      {/* Main Canvas Container */}
      <div className="flex-1 relative overflow-hidden bg-slate-100 cursor-crosshair">
        <div
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            onWheel={handleWheel}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
        >
            <div
                ref={contentRef} // Ref assegnato al contenitore che viene effettivamente trasformato
                id="export-container"
                style={{
                    transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
                    transformOrigin: '0 0',
                    width: '100%',
                    height: '100%'
                }}
                className="relative w-full h-full"
            >
                <div className="absolute -inset-[5000px] pointer-events-none opacity-10"
                     style={{
                        backgroundImage: 'radial-gradient(#64748b 1px, transparent 1px)',
                        backgroundSize: '20px 20px'
                     }}
                ></div>

                {/* SVG Layer: Solo Linee */}
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-visible"
                    style={{ overflow: 'visible' }}
                >
                    {edges.map(renderEdgeLine)}
                    {renderTempLine()}
                </svg>

                {/* HTML Overlay Layer: Etichette e UI Collegamenti */}
                <div className="absolute top-0 left-0 w-0 h-0 overflow-visible z-20 pointer-events-none">
                     {edges.map(renderEdgeOverlay)}
                </div>

                {/* Node Layer */}
                {nodes.map(node => (
                    <div
                        key={node.id}
                        onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                        onMouseUp={(e) => handleNodeMouseUp(e, node.id)}
                        onMouseEnter={() => setHoveredNodeId(node.id)}
                        onMouseLeave={() => setHoveredNodeId(null)}
                        onDoubleClick={(e) => { e.stopPropagation(); startEditingNode(node.id); }}
                        style={{
                            transform: `translate(${node.x}px, ${node.y}px)`,
                            width: '140px',
                            minHeight: '50px'
                        }}
                        className={`absolute z-30 flex flex-col items-center justify-center p-2 rounded-lg border-2 shadow-sm select-none
                            ${selectedNodeId === node.id && !isExporting ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-slate-300 hover:border-indigo-300'}
                            ${mode === 'edge' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}
                            ${node.color || 'bg-white'} transition-colors duration-200
                        `}
                    >
                        {node.isEditing && !isExporting ? (
                            <input
                                autoFocus
                                type="text"
                                defaultValue={node.text}
                                onBlur={(e) => updateNodeText(node.id, e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') updateNodeText(node.id, e.currentTarget.value); }}
                                className="w-full text-center text-sm p-1 border-b border-indigo-500 outline-none bg-transparent"
                                onMouseDown={(e) => e.stopPropagation()}
                            />
                        ) : (
                            // UPDATE: Stile inline per transform per offset export
                            <div className="w-full h-full flex items-center justify-center text-center">
                                <span
                                    className="text-sm font-medium leading-none break-words pointer-events-none w-full"
                                    style={{ transform: isExporting ? 'translateY(-5px)' : 'none' }}
                                >
                                    {node.text}
                                </span>
                            </div>
                        )}
                        {selectedNodeId === node.id && !node.isEditing && !isExporting && (
                            <button
                                onClick={(e) => { e.stopPropagation(); deleteNode(node.id); }}
                                className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 shadow-sm transition-transform hover:scale-110"
                            >
                                <Trash2 size={12} />
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
      </div>
    </div>
  );
};

const ToolButton = ({ active, onClick, icon, label }) => (
    <button
        onClick={onClick}
        className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all
            ${active
                ? 'bg-white text-indigo-600 shadow-sm border border-slate-200'
                : 'text-slate-500 hover:bg-slate-200 hover:text-slate-700'
            }`}
    >
        {icon}
        <span className="hidden sm:inline">{label}</span>
    </button>
);

export default ProcessEditor;