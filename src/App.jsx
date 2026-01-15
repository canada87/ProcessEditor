import React, { useState, useRef, useEffect } from 'react';
import { Plus, ArrowRight, Move, Trash2, Eraser, MousePointer2, Save, Upload, X, Palette, Activity, Layout, Type } from 'lucide-react';

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

const ProcessEditor = () => {
  // --- Stati principali ---
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [groups, setGroups] = useState([]); // NUOVO: Stato per i riquadri/gruppi
  const [mode, setMode] = useState('pointer'); // 'pointer', 'node', 'edge'

  // --- Viewport (Zoom e Pan) ---
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // --- Selezione Multipla ---
  const [selectedNodeIds, setSelectedNodeIds] = useState(new Set());
  const [selectedGroupIds, setSelectedGroupIds] = useState(new Set()); // NUOVO: Selezione gruppi
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);

  // --- Box di Selezione (Rubber Band) ---
  const [selectionBox, setSelectionBox] = useState(null);

  // --- Interazione Mouse ---
  const [linkingSourceId, setLinkingSourceId] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Dragging
  const [isDraggingItems, setIsDraggingItems] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });

  // --- Opzioni ---
  const [autoConnect, setAutoConnect] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  // --- Riferimenti ---
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const hasMovedRef = useRef(false);

  // --- Costanti ---
  const NODE_WIDTH = 140;
  const NODE_HEIGHT = 50;

  // --- Gestione Salvataggio/Caricamento Progetto (JSON) ---
  const handleSaveProject = () => {
    const projectData = {
      version: 5, // Incremento versione per supporto gruppi
      nodes: nodes,
      edges: edges,
      groups: groups,
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
          setEdges(data.edges.map(e => ({ ...e, isEditing: false })));
          setGroups(Array.isArray(data.groups) ? data.groups.map(g => ({...g, isEditing: false})) : []); // Carica gruppi

          if (data.viewport) setViewport(data.viewport);

          setSelectedNodeIds(new Set());
          setSelectedGroupIds(new Set());
          setSelectedEdgeId(null);
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
        setGroups([]);
        setSelectedNodeIds(new Set());
        setSelectedGroupIds(new Set());
        setConfirmClear(false);
    } else {
        setConfirmClear(true);
        setTimeout(() => setConfirmClear(false), 3000);
    }
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
      id: crypto.randomUUID(),
      x: worldX - NODE_WIDTH / 2,
      y: worldY - NODE_HEIGHT / 2,
      text: "", // Inizia vuoto come richiesto
      color: 'bg-white',
      isEditing: true
    };

    setNodes(prev => [...prev, newNode]);

    if (autoConnect && selectedNodeIds.size === 1) {
      const sourceId = Array.from(selectedNodeIds)[0];
      addEdge(sourceId, newNode.id);
    }

    setSelectedNodeIds(new Set([newNode.id]));
    setSelectedGroupIds(new Set());
    setSelectedEdgeId(null);
  };

  // --- Gestione Gruppi ---
  const createGroupFromSelection = () => {
    if (selectedNodeIds.size === 0) return;

    const selectedNodesList = nodes.filter(n => selectedNodeIds.has(n.id));

    // Calcola bounding box
    const minX = Math.min(...selectedNodesList.map(n => n.x));
    const minY = Math.min(...selectedNodesList.map(n => n.y));
    const maxX = Math.max(...selectedNodesList.map(n => n.x + NODE_WIDTH));
    const maxY = Math.max(...selectedNodesList.map(n => n.y + NODE_HEIGHT));

    const padding = 30;
    const headerHeight = 30;

    const newGroup = {
        id: crypto.randomUUID(),
        x: minX - padding,
        y: minY - padding - headerHeight,
        width: maxX - minX + (padding * 2),
        height: maxY - minY + (padding * 2) + headerHeight,
        label: "", // Inizia vuoto come richiesto
        isEditing: true
    };

    setGroups(prev => [...prev, newGroup]);

    // Seleziona il nuovo gruppo e deseleziona i nodi (opzionale, ma spesso comodo)
    setSelectedGroupIds(new Set([newGroup.id]));
    setSelectedNodeIds(new Set());
  };

  const updateGroupLabel = (id, newLabel) => {
    setGroups(prev => prev.map(g =>
        g.id === id ? { ...g, label: newLabel, isEditing: false } : g
    ));
  };

  const startEditingGroup = (id) => {
    setGroups(prev => prev.map(g =>
        g.id === id ? { ...g, isEditing: true } : g
    ));
  };

  // --- Spostamento Unificato (Nodi e Gruppi) ---
  const moveSelectedItems = (dx, dy) => {
    // Sposta nodi selezionati
    if (selectedNodeIds.size > 0) {
        setNodes(prev => prev.map(n =>
            selectedNodeIds.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n
        ));
    }
    // Sposta gruppi selezionati
    if (selectedGroupIds.size > 0) {
        setGroups(prev => prev.map(g =>
            selectedGroupIds.has(g.id) ? { ...g, x: g.x + dx, y: g.y + dy } : g
        ));
    }
  };

  const updateNodeText = (id, newText) => {
    setNodes(prev => prev.map(n =>
      n.id === id ? { ...n, text: newText, isEditing: false } : n
    ));
  };

  const updateNodeColor = (newColorClass) => {
    setNodes(prev => prev.map(n =>
        selectedNodeIds.has(n.id) ? { ...n, color: newColorClass } : n
    ));
  };

  const startEditingNode = (id) => {
    setNodes(prev => prev.map(n =>
      n.id === id ? { ...n, isEditing: true } : n
    ));
  };

  const deleteSelected = () => {
    // Elimina nodi
    if (selectedNodeIds.size > 0) {
        setNodes(nodes.filter(n => !selectedNodeIds.has(n.id)));
        setEdges(edges.filter(e => !selectedNodeIds.has(e.from) && !selectedNodeIds.has(e.to)));
        setSelectedNodeIds(new Set());
    }
    // Elimina gruppi
    if (selectedGroupIds.size > 0) {
        setGroups(groups.filter(g => !selectedGroupIds.has(g.id)));
        setSelectedGroupIds(new Set());
    }
    // Elimina arco
    if (selectedEdgeId) {
        deleteEdge(selectedEdgeId);
    }
  };

  // --- Gestione Link (Edges) ---
  const addEdge = (fromId, toId) => {
    if (fromId === toId) return;
    const exists = edges.some(e => e.from === fromId && e.to === toId);
    if (!exists) {
      setEdges(prev => [...prev, {
        id: crypto.randomUUID(),
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

  // --- Gestione Eventi Canvas ---
  const handleWheel = (e) => {
    e.preventDefault();
    if (e.ctrlKey) return;
    const zoomSensitivity = 0.001;
    const delta = -e.deltaY * zoomSensitivity;
    const newZoom = Math.min(Math.max(viewport.zoom + delta * 2, 0.1), 3);
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
    if (e.button === 2 || e.button === 1) { // Pan Right/Middle click
        setIsPanning(true);
        setPanStart({ x: e.clientX, y: e.clientY });
        hasMovedRef.current = false;
        return;
    }

    if (e.button === 0) { // Left click
        if (hoveredNodeId) return;

        const worldPos = screenToWorld(e.clientX, e.clientY);

        if (mode === 'pointer') {
            // Se clicco su un gruppo (ma non su un nodo), lo gestisco in handleGroupMouseDown.
            // Se arrivo qui, ho cliccato sul vuoto.
            setSelectionBox({
                startX: worldPos.x, startY: worldPos.y,
                currentX: worldPos.x, currentY: worldPos.y
            });

            if (!e.shiftKey) {
                setSelectedNodeIds(new Set());
                setSelectedGroupIds(new Set()); // Pulisco selezione gruppi
                setSelectedEdgeId(null);
            }
        }
        setPanStart({ x: e.clientX, y: e.clientY });
        hasMovedRef.current = false;
    }
  };

  const handleCanvasMouseMove = (e) => {
    const worldPos = screenToWorld(e.clientX, e.clientY);
    setMousePos(worldPos);

    if (!hasMovedRef.current && (e.buttons === 1 || e.buttons === 2 || e.buttons === 4)) {
         const dx = e.clientX - panStart.x;
         const dy = e.clientY - panStart.y;
         if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMovedRef.current = true;
    }

    if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      setViewport(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
      setPanStart({ x: e.clientX, y: e.clientY });
      return;
    }

    if (isDraggingItems && mode === 'pointer') {
        const dx = worldPos.x - lastMousePos.x;
        const dy = worldPos.y - lastMousePos.y;
        moveSelectedItems(dx, dy);
        setLastMousePos(worldPos);
        hasMovedRef.current = true;
        return;
    }

    if (selectionBox) {
        setSelectionBox(prev => ({ ...prev, currentX: worldPos.x, currentY: worldPos.y }));

        const x1 = Math.min(selectionBox.startX, worldPos.x);
        const y1 = Math.min(selectionBox.startY, worldPos.y);
        const x2 = Math.max(selectionBox.startX, worldPos.x);
        const y2 = Math.max(selectionBox.startY, worldPos.y);

        // Selezione Nodi
        const nodesInBox = nodes.filter(n =>
            n.x < x2 && (n.x + NODE_WIDTH) > x1 && n.y < y2 && (n.y + NODE_HEIGHT) > y1
        ).map(n => n.id);

        // Selezione Gruppi (se il box tocca il gruppo)
        const groupsInBox = groups.filter(g =>
            g.x < x2 && (g.x + g.width) > x1 && g.y < y2 && (g.y + g.height) > y1
        ).map(g => g.id);

        if (!e.shiftKey) {
            setSelectedNodeIds(new Set(nodesInBox));
            setSelectedGroupIds(new Set(groupsInBox));
        } else {
            // Logica additiva semplificata
            const newN = new Set(selectedNodeIds);
            nodesInBox.forEach(id => newN.add(id));
            setSelectedNodeIds(newN);

            const newG = new Set(selectedGroupIds);
            groupsInBox.forEach(id => newG.add(id));
            setSelectedGroupIds(newG);
        }
    }
  };

  const handleCanvasMouseUp = (e) => {
    if (isPanning) { setIsPanning(false); return; }
    if (selectionBox) setSelectionBox(null);

    if (mode === 'node' && e.button === 0 && !hasMovedRef.current && !hoveredNodeId) {
          const worldPos = screenToWorld(e.clientX, e.clientY);
          addNode(worldPos.x, worldPos.y);
    }
    setIsDraggingItems(false);
  };

  // --- Handler Specifici per Nodi e Gruppi ---
  const handleNodeMouseDown = (e, nodeId) => {
    e.stopPropagation();
    if (e.button !== 0) return;

    if (mode === 'edge') {
      setLinkingSourceId(nodeId);
    } else if (mode === 'pointer') {
      const worldPos = screenToWorld(e.clientX, e.clientY);
      let newSelection = new Set(selectedNodeIds);

      if (e.shiftKey) {
          if (newSelection.has(nodeId)) newSelection.delete(nodeId); else newSelection.add(nodeId);
          setSelectedNodeIds(newSelection);
      } else {
          if (!newSelection.has(nodeId)) {
              newSelection = new Set([nodeId]);
              setSelectedNodeIds(newSelection);
              // Se seleziono un nodo singolarmente senza shift, deseleziono i gruppi per evitare confusione
              setSelectedGroupIds(new Set());
          }
      }
      setIsDraggingItems(true);
      setLastMousePos(worldPos);
      setSelectedEdgeId(null);
    } else if (mode === 'node') {
        setSelectedNodeIds(new Set([nodeId]));
        setSelectedGroupIds(new Set());
        setSelectedEdgeId(null);
    }
  };

  const handleGroupMouseDown = (e, groupId) => {
    // Interrompiamo la propagazione solo se siamo in modalità pointer, altrimenti lasciamo che il canvas gestisca (es. per creare nodi sopra i gruppi)
    if (mode === 'pointer') {
        e.stopPropagation();
        if (e.button !== 0) return;

        const worldPos = screenToWorld(e.clientX, e.clientY);
        let newSelection = new Set(selectedGroupIds);

        if (e.shiftKey) {
            if (newSelection.has(groupId)) newSelection.delete(groupId); else newSelection.add(groupId);
            setSelectedGroupIds(newSelection);
        } else {
            if (!newSelection.has(groupId)) {
                newSelection = new Set([groupId]);
                setSelectedGroupIds(newSelection);
                // Manteniamo i nodi selezionati? Generalmente no se clicco sul gruppo
                setSelectedNodeIds(new Set());
            }
        }
        setIsDraggingItems(true);
        setLastMousePos(worldPos);
        setSelectedEdgeId(null);
    }
  };

  // --- Helper Rendering ---
  const getEdgeMetrics = (edge) => {
      const fromNode = nodes.find(n => n.id === edge.from);
      const toNode = nodes.find(n => n.id === edge.to);
      if (!fromNode || !toNode) return null;

      const start = { x: fromNode.x + NODE_WIDTH/2, y: fromNode.y + NODE_HEIGHT/2 };
      const endRaw = { x: toNode.x + NODE_WIDTH/2, y: toNode.y + NODE_HEIGHT/2 };
      const angle = Math.atan2(endRaw.y - start.y, endRaw.x - start.x);
      const endX = endRaw.x - 0 * Math.cos(angle);
      const endY = endRaw.y - 0 * Math.sin(angle);
      const arrowLen = 10;
      const arrowAngle = Math.PI / 6;
      const p1x = endX - arrowLen * Math.cos(angle - arrowAngle);
      const p1y = endY - arrowLen * Math.sin(angle - arrowAngle);
      const p2x = endX - arrowLen * Math.cos(angle + arrowAngle);
      const p2y = endY - arrowLen * Math.sin(angle + arrowAngle);
      const midX = (start.x + endX) / 2;
      const midY = (start.y + endY) / 2;

      return { start, end: { x: endX, y: endY }, arrowPoly: `${endX},${endY} ${p1x},${p1y} ${p2x},${p2y}`, mid: { x: midX, y: midY } };
  };

  // --- Rendering Functions ---
  const renderEdgeLine = (edge) => {
    const metrics = getEdgeMetrics(edge);
    if (!metrics) return null;
    const { start, end, arrowPoly } = metrics;
    const isSelected = selectedEdgeId === edge.id;
    const strokeColor = isSelected ? "#6366f1" : "#94a3b8";
    const styleObj = EDGE_STYLES.find(s => s.id === edge.style) || EDGE_STYLES[0];

    return (
      <g key={edge.id}
         onClick={(e) => { e.stopPropagation(); if (mode === 'pointer') { setSelectedEdgeId(edge.id); setSelectedNodeIds(new Set()); setSelectedGroupIds(new Set()); } }}
         onDoubleClick={(e) => { e.stopPropagation(); startEditingEdge(edge.id); }}
         className={`pointer-events-auto ${mode === 'pointer' ? 'cursor-pointer' : ''}`}
      >
        <path d={`M ${start.x} ${start.y} L ${end.x} ${end.y}`} stroke="transparent" strokeWidth="20" />
        <path d={`M ${start.x} ${start.y} L ${end.x} ${end.y}`} stroke={strokeColor} strokeWidth={isSelected ? "3" : "2"} strokeDasharray={styleObj.dash} />
        <polygon points={arrowPoly} fill={strokeColor} />
      </g>
    );
  };

  const renderEdgeOverlay = (edge) => {
    const metrics = getEdgeMetrics(edge);
    if (!metrics) return null;
    const { mid } = metrics;
    const isSelected = selectedEdgeId === edge.id;
    if (!edge.text && !edge.isEditing && !isSelected) return null;

    return (
        <div key={`overlay-${edge.id}`} style={{ position: 'absolute', left: mid.x, top: mid.y, transform: 'translate(-50%, -50%)', pointerEvents: 'none' }} className="flex flex-col items-center justify-center z-20">
            {(edge.text || edge.isEditing) && (
                <div className="pointer-events-auto mb-1" onDoubleClick={(e) => { e.stopPropagation(); startEditingEdge(edge.id); }}>
                    {edge.isEditing ? (
                        <input autoFocus type="text" defaultValue={edge.text} onBlur={(e) => updateEdgeText(edge.id, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') updateEdgeText(edge.id, e.currentTarget.value); }} className="text-xs text-center p-1 border border-indigo-500 rounded bg-white shadow-sm outline-none min-w-[60px]" onMouseDown={(e) => e.stopPropagation()} />
                    ) : (
                        <div className="bg-white/90 backdrop-blur-sm px-2 py-0.5 rounded border border-slate-200 shadow-sm cursor-pointer hover:border-indigo-300 whitespace-nowrap flex items-center justify-center">
                            <span className="text-xs font-medium text-slate-600 leading-none">{edge.text}</span>
                        </div>
                    )}
                </div>
            )}
            {isSelected && (
                <div className="pointer-events-auto cursor-pointer mt-1 relative z-50" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); deleteEdge(edge.id); }}>
                    <div className="bg-red-500 text-white rounded-full p-1 hover:bg-red-600 shadow transition-transform hover:scale-110 flex items-center justify-center w-5 h-5"><X size={12} strokeWidth={3} /></div>
                </div>
            )}
        </div>
    );
  };

  const renderSelectionBox = () => {
    if (!selectionBox) return null;
    const x = Math.min(selectionBox.startX, selectionBox.currentX);
    const y = Math.min(selectionBox.startY, selectionBox.currentY);
    const width = Math.abs(selectionBox.currentX - selectionBox.startX);
    const height = Math.abs(selectionBox.currentY - selectionBox.startY);

    return <div style={{ position: 'absolute', left: x, top: y, width: width, height: height, backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.5)', pointerEvents: 'none', zIndex: 100 }} />;
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
            <ToolButton active={mode === 'node'} onClick={() => setMode('node')} icon={<Plus size={18}/>} label="Nodo" />
            <ToolButton active={mode === 'edge'} onClick={() => setMode('edge')} icon={<ArrowRight size={18}/>} label="Link" />
        </div>
        <div className="flex items-center gap-2">
            <div className="text-xs text-slate-400 font-mono hidden xl:block mr-2">Zoom: {(viewport.zoom * 100).toFixed(0)}%</div>

            {/* Pulsante Crea Gruppo (visibile se ci sono nodi selezionati) */}
            {selectedNodeIds.size > 0 && (
                <button
                    onClick={createGroupFromSelection}
                    className="flex items-center gap-1 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-3 py-2 rounded-md text-sm font-medium transition-colors border border-indigo-200 animate-in fade-in"
                    title="Raggruppa Selezionati"
                >
                    <Layout size={18} />
                    <span className="hidden sm:inline">Raggruppa</span>
                </button>
            )}

            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none mx-2 bg-slate-50 p-1 px-2 rounded border border-slate-200">
                <input type="checkbox" checked={autoConnect} onChange={(e) => setAutoConnect(e.target.checked)} className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500" />
                <span className="hidden md:inline">Auto-collega</span>
            </label>

            {/* Colori Nodi */}
            {selectedNodeIds.size > 0 && (
                <div className="flex items-center gap-1 border-l border-r border-slate-200 px-3 mx-1 animate-in fade-in zoom-in duration-200">
                    <Palette size={16} className="text-slate-400 mr-1" />
                    {NODE_COLORS.map(color => (
                        <button key={color.id} onClick={() => updateNodeColor(color.class)} className={`w-5 h-5 rounded-full border border-slate-300 ${color.class} hover:scale-125 transition-transform shadow-sm`} title={color.label} />
                    ))}
                </div>
            )}

            {/* Stili Linee */}
            {selectedEdgeId && (
                <div className="flex items-center gap-1 border-l border-r border-slate-200 px-3 mx-1 animate-in fade-in zoom-in duration-200">
                    <Activity size={16} className="text-slate-400 mr-1" />
                    {EDGE_STYLES.map(style => (
                        <button key={style.id} onClick={() => updateEdgeStyle(selectedEdgeId, style.id)} className={`w-8 h-8 flex items-center justify-center rounded hover:bg-slate-100 border border-slate-200 transition-colors ${edges.find(e => e.id === selectedEdgeId)?.style === style.id ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-200' : 'bg-white'}`} title={style.label}>
                            <svg width="20" height="2" overflow="visible"><line x1="0" y1="1" x2="20" y2="1" stroke="currentColor" strokeWidth="2" strokeDasharray={style.dash === '5,5' ? '4,2' : style.dash === '2,2' ? '1,2' : ''} className="text-slate-700" /></svg>
                        </button>
                    ))}
                </div>
            )}

            {/* Cestino */}
            {(selectedNodeIds.size > 0 || selectedEdgeId || selectedGroupIds.size > 0) && (
                <button onClick={deleteSelected} className="bg-red-100 text-red-600 hover:bg-red-200 p-2 rounded transition-colors mr-2" title="Elimina Selezionato">
                    <Trash2 size={18} />
                </button>
            )}

            <input type="file" ref={fileInputRef} onChange={handleLoadProject} accept=".json" className="hidden" />
            <button onClick={() => fileInputRef.current.click()} className="text-slate-600 hover:bg-slate-100 p-2 rounded transition-colors flex items-center gap-1" title="Carica"><Upload size={18} /></button>
            <button onClick={handleSaveProject} className="text-slate-600 hover:bg-slate-100 p-2 rounded transition-colors flex items-center gap-1" title="Salva"><Save size={18} /></button>
            <div className="h-6 w-px bg-slate-300 mx-1"></div>
            <button onClick={handleClearAll} className={`p-2 rounded transition-all flex items-center gap-1 ${confirmClear ? 'bg-red-500 text-white shadow-inner' : 'text-red-500 hover:bg-red-50'}`} title={confirmClear ? "Conferma" : "Pulisci"}>
                {confirmClear ? <span className="text-xs font-bold px-1 whitespace-nowrap animate-pulse">Sicuro?</span> : <Eraser size={20} />}
            </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative overflow-hidden bg-slate-100 cursor-crosshair">
        <div ref={canvasRef} className="absolute inset-0 w-full h-full" onContextMenu={(e) => e.preventDefault()} onWheel={handleWheel} onMouseDown={handleCanvasMouseDown} onMouseMove={handleCanvasMouseMove} onMouseUp={handleCanvasMouseUp}>
            <div style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`, transformOrigin: '0 0', width: '100%', height: '100%' }} className="relative w-full h-full">
                <div className="absolute -inset-[5000px] pointer-events-none opacity-10" style={{ backgroundImage: 'radial-gradient(#64748b 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>

                {/* Layer Gruppi (Sotto tutto) */}
                {groups.map(group => (
                    <div
                        key={group.id}
                        onMouseDown={(e) => handleGroupMouseDown(e, group.id)}
                        onDoubleClick={(e) => { e.stopPropagation(); startEditingGroup(group.id); }}
                        style={{
                            transform: `translate(${group.x}px, ${group.y}px)`,
                            width: `${group.width}px`,
                            height: `${group.height}px`
                        }}
                        className={`absolute z-0 border-2 border-dashed rounded-lg transition-colors flex flex-col
                            ${selectedGroupIds.has(group.id) ? 'border-indigo-400 bg-indigo-50/30' : 'border-slate-300 bg-slate-50/50 hover:border-indigo-200'}
                            ${mode === 'pointer' ? 'cursor-move' : ''}
                        `}
                    >
                        {/* Etichetta Gruppo */}
                        <div className="px-2 py-1 -mt-8 self-start max-w-full">
                            {group.isEditing ? (
                                <input
                                    autoFocus
                                    type="text"
                                    defaultValue={group.label}
                                    placeholder="Nome Gruppo" // Placeholder aggiunto
                                    onBlur={(e) => updateGroupLabel(group.id, e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') updateGroupLabel(group.id, e.currentTarget.value); }}
                                    className="bg-white border border-indigo-400 rounded px-1 py-0.5 text-sm text-indigo-700 font-bold outline-none shadow-sm min-w-[100px]"
                                    onMouseDown={(e) => e.stopPropagation()}
                                />
                            ) : (
                                <span className={`text-sm font-bold uppercase tracking-wider px-1 ${selectedGroupIds.has(group.id) ? 'text-indigo-600' : 'text-slate-400'}`}>
                                    {group.label}
                                </span>
                            )}
                        </div>
                    </div>
                ))}

                {/* Layer Linee */}
                <svg xmlns="http://www.w3.org/2000/svg" className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-visible" style={{ overflow: 'visible' }}>
                    {edges.map(renderEdgeLine)}
                    {mode === 'edge' && linkingSourceId && nodes.find(n => n.id === linkingSourceId) && (
                        <path d={`M ${nodes.find(n => n.id === linkingSourceId).x + NODE_WIDTH/2} ${nodes.find(n => n.id === linkingSourceId).y + NODE_HEIGHT/2} L ${mousePos.x} ${mousePos.y}`} stroke="#3b82f6" strokeWidth="2" strokeDasharray="5,5" pointerEvents="none" />
                    )}
                </svg>

                {/* Layer Overlay (Edge labels) e Selection Box */}
                <div className="absolute top-0 left-0 w-0 h-0 overflow-visible z-20 pointer-events-none">
                     {edges.map(renderEdgeOverlay)}
                     {renderSelectionBox()}
                </div>

                {/* Layer Nodi */}
                {nodes.map(node => (
                    <div
                        key={node.id}
                        onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                        onMouseUp={(e) => { e.stopPropagation(); if (mode === 'edge' && linkingSourceId) { addEdge(linkingSourceId, node.id); setLinkingSourceId(null); } setIsDraggingItems(false); }}
                        onMouseEnter={() => setHoveredNodeId(node.id)}
                        onMouseLeave={() => setHoveredNodeId(null)}
                        onDoubleClick={(e) => { e.stopPropagation(); startEditingNode(node.id); }}
                        style={{ transform: `translate(${node.x}px, ${node.y}px)`, width: `${NODE_WIDTH}px`, minHeight: `${NODE_HEIGHT}px` }}
                        className={`absolute z-30 flex flex-col items-center justify-center p-2 rounded-lg border-2 shadow-sm select-none
                            ${selectedNodeIds.has(node.id) ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-slate-300 hover:border-indigo-300'}
                            ${mode === 'edge' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}
                            ${node.color || 'bg-white'} transition-colors duration-200
                        `}
                    >
                        {node.isEditing ? (
                            <input autoFocus type="text" defaultValue={node.text} placeholder="Nome Step" onBlur={(e) => updateNodeText(node.id, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') updateNodeText(node.id, e.currentTarget.value); }} className="w-full text-center text-sm p-1 border-b border-indigo-500 outline-none bg-transparent" onMouseDown={(e) => e.stopPropagation()} />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-center"><span className="text-sm font-medium leading-none break-words pointer-events-none w-full">{node.text}</span></div>
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
    <button onClick={onClick} className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${active ? 'bg-white text-indigo-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-slate-200 hover:text-slate-700'}`}>
        {icon} <span className="hidden sm:inline">{label}</span>
    </button>
);

export default ProcessEditor;