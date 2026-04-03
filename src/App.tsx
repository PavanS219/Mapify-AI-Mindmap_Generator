import { useState, useCallback, useRef } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  MarkerType,
  Node,
  NodeMouseHandler,
  getRectOfNodes,
  getTransformForBounds,
} from 'reactflow'
import {
  Brain, Sparkles, Send, Download, Trash2,
  Plus, ChevronRight, Menu, Github, Loader2,
} from 'lucide-react'
import 'reactflow/dist/style.css'
import { v4 as uuidv4 } from 'uuid'
import { cn } from './lib/utils'
import { generateMindMap, expandNode } from './lib/minimax'
import { toPng } from 'html-to-image'

const BRANCH_COLORS = [
  { node: '#3b82f6', light: '#1e3a5f' },
  { node: '#8b5cf6', light: '#2e1f5e' },
  { node: '#10b981', light: '#064e3b' },
  { node: '#f59e0b', light: '#451a03' },
  { node: '#ef4444', light: '#450a0a' },
  { node: '#06b6d4', light: '#083344' },
  { node: '#ec4899', light: '#500724' },
  { node: '#84cc16', light: '#1a2e05' },
];

const initialNodes: Node[] = [{
  id: 'root',
  type: 'input',
  position: { x: 600, y: 300 },
  data: { label: '💡 Start your idea here' },
  style: {
    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
    color: '#fff', borderRadius: '16px', padding: '14px 28px',
    fontWeight: 'bold', border: 'none',
    boxShadow: '0 4px 24px rgba(99,102,241,0.5)',
    fontSize: '16px', minWidth: '180px', textAlign: 'center', cursor: 'pointer',
  }
}];

const nodeColorMap = new Map<string, number>();
nodeColorMap.set('root', 0);

function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [expandingNodeId, setExpandingNodeId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [history, setHistory] = useState<string[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [rfInstance, setRfInstance] = useState<any>(null);

  const onConnect = useCallback(
    (params: Connection | Edge) => setEdges(eds => addEdge(params, eds)), [setEdges]
  );

  const buildNodes = (
    data: any, parentId: string, px: number, py: number,
    angle: number, depth = 1, colorIdx = 0
  ) => {
    const id = uuidv4();
    const dist = depth === 1 ? 280 : 200;
    const x = px + Math.cos(angle) * dist;
    const y = py + Math.sin(angle) * dist;
    const c = BRANCH_COLORS[colorIdx % BRANCH_COLORS.length];
    nodeColorMap.set(id, colorIdx);

    const node: Node = {
      id, position: { x, y },
      data: { label: `${data.label}\n✨ tap to go deeper` },
      style: {
        background: depth === 1 ? c.light : '#0f172a',
        color: depth === 1 ? '#f1f5f9' : '#94a3b8',
        border: `1.5px solid ${depth === 1 ? c.node : '#1e293b'}`,
        borderRadius: depth === 1 ? '14px' : '10px',
        padding: depth === 1 ? '10px 16px' : '8px 12px',
        fontSize: depth === 1 ? '13px' : '11px',
        fontWeight: depth === 1 ? '600' : '400',
        width: depth === 1 ? 160 : 140,
        textAlign: 'center',
        boxShadow: depth === 1 ? `0 4px 20px ${c.node}33` : 'none',
        cursor: 'pointer', whiteSpace: 'pre-line', lineHeight: '1.4',
      }
    };

    const edge = {
      id: uuidv4(), source: parentId, target: id,
      animated: depth === 1,
      style: { stroke: c.node, strokeWidth: depth === 1 ? 2 : 1.5, opacity: depth === 1 ? 1 : 0.6 },
      markerEnd: { type: MarkerType.ArrowClosed, color: c.node },
    };

    let allNodes = [node], allEdges = [edge];
    if (data.subtopics?.length > 0) {
      const spread = Math.PI / 2.5;
      const startAngle = angle - spread / 2;
      const step = data.subtopics.length > 1 ? spread / (data.subtopics.length - 1) : 0;
      data.subtopics.forEach((sub: any, i: number) => {
        const { nodes: ns, edges: es } = buildNodes(sub, id, x, y, startAngle + i * step, depth + 1, colorIdx);
        allNodes = [...allNodes, ...ns]; allEdges = [...allEdges, ...es];
      });
    }
    return { nodes: allNodes, edges: allEdges };
  };

  // ✨ THE WOW FEATURE — click any node to expand deeper
  const onNodeClick: NodeMouseHandler = useCallback(async (_, node) => {
    if (node.id === 'root' || expandedNodes.has(node.id) || expandingNodeId) return;

    const rawLabel = (node.data.label as string)
      .replace('\n✨ tap to go deeper', '')
      .replace('\n✅ expanded', '')
      .replace('\n⏳ thinking...', '')
      .trim();

    setExpandingNodeId(node.id);
    setNodes(nds => nds.map(n =>
      n.id === node.id
        ? { ...n, data: { label: `⏳ thinking...\n${rawLabel}` }, style: { ...n.style, opacity: 0.7 } }
        : n
    ));

    try {
      const expanded = await expandNode(rawLabel);
      const colorIdx = nodeColorMap.get(node.id) ?? 0;

      const count = expanded.subtopics?.length ?? 0;
      const step = count > 1 ? Math.PI / (count + 1) : 0;
      const startAngle = -Math.PI / 2 - (step * (count - 1)) / 2;

      const newNodes: Node[] = [];
      const newEdges: any[] = [];

      expanded.subtopics?.forEach((sub: any, i: number) => {
        const childColorIdx = (colorIdx + i + 1) % BRANCH_COLORS.length;
        const cc = BRANCH_COLORS[childColorIdx];
        const childId = uuidv4();
        nodeColorMap.set(childId, childColorIdx);
        const angle = startAngle + i * step + Math.PI / 2;
        const dist = 190;
        const x = node.position.x + Math.cos(angle) * dist;
        const y = node.position.y + Math.sin(angle) * dist;

        newNodes.push({
          id: childId, position: { x, y },
          data: { label: `${sub.label}\n✨ tap to go deeper` },
          style: {
            background: cc.light, color: '#f1f5f9',
            border: `1.5px solid ${cc.node}`, borderRadius: '12px',
            padding: '9px 14px', fontSize: '12px', fontWeight: '500',
            width: 150, textAlign: 'center',
            boxShadow: `0 4px 16px ${cc.node}44`,
            cursor: 'pointer', whiteSpace: 'pre-line', lineHeight: '1.4',
          }
        });

        newEdges.push({
          id: uuidv4(), source: node.id, target: childId, animated: true,
          style: { stroke: cc.node, strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: cc.node },
        });
      });

      const c = BRANCH_COLORS[colorIdx % BRANCH_COLORS.length];
      setNodes(nds => [
        ...nds.map(n =>
          n.id === node.id
            ? { ...n, data: { label: `${rawLabel}\n✅ expanded` }, style: { ...n.style, opacity: 1, border: `2px solid ${c.node}` } }
            : n
        ),
        ...newNodes
      ]);
      setEdges(eds => [...eds, ...newEdges]);
      setExpandedNodes(prev => new Set([...prev, node.id]));
      setTimeout(() => rfInstance?.fitView({ padding: 0.2, duration: 600 }), 100);

    } catch {
      setNodes(nds => nds.map(n =>
        n.id === node.id
          ? { ...n, data: { label: `${rawLabel}\n✨ tap to go deeper` }, style: { ...n.style, opacity: 1 } }
          : n
      ));
    } finally {
      setExpandingNodeId(null);
    }
  }, [expandedNodes, expandingNodeId, rfInstance]);

  const handleGenerate = async () => {
    if (!input.trim() || isLoading) return;
    setIsLoading(true);
    try {
      const data = await generateMindMap(input);
      const count = data.subtopics?.length || 1;
      const step = (Math.PI * 2) / count;
      let allNodes: Node[] = [], allEdges: any[] = [];
      data.subtopics?.forEach((sub: any, i: number) => {
        const { nodes: ns, edges: es } = buildNodes(sub, 'root', 600, 300, i * step - Math.PI / 2, 1, i);
        allNodes = [...allNodes, ...ns]; allEdges = [...allEdges, ...es];
      });
      setNodes(nds => [
        ...nds.map(n => n.id === 'root' ? { ...n, data: { label: `💡 ${data.label}` } } : n),
        ...allNodes
      ]);
      setEdges(eds => [...eds, ...allEdges]);
      setHistory(h => [input, ...h.slice(0, 4)]);
      setInput('');
      setExpandedNodes(new Set());
      setTimeout(() => rfInstance?.fitView({ padding: 0.2, duration: 600 }), 100);
    } catch {
      alert('Failed to generate. Check your VITE_GROQ_API_KEY in .env');
    } finally {
      setIsLoading(false);
    }
  };

  const clearCanvas = () => {
    setNodes(initialNodes); setEdges([]);
    setExpandedNodes(new Set());
    nodeColorMap.clear(); nodeColorMap.set('root', 0);
  };

  const handleExport = useCallback(() => {
    if (!reactFlowWrapper.current) return;
    const bounds = getRectOfNodes(nodes);
    const w = 1920, h = 1080;
    const transform = getTransformForBounds(bounds, w, h, 0.5, 2);
    const vp = reactFlowWrapper.current.querySelector('.react-flow__viewport') as HTMLElement;
    if (!vp) return;
    toPng(vp, {
      backgroundColor: '#020617', width: w, height: h,
      style: { width: `${w}px`, height: `${h}px`, transform: `translate(${transform[0]}px,${transform[1]}px) scale(${transform[2]})` },
    }).then(url => { const a = document.createElement('a'); a.href = url; a.download = 'mindmap.png'; a.click(); });
  }, [nodes]);

  return (
    <div className="h-screen w-full bg-[#020617] text-slate-200 flex overflow-hidden font-sans">
      <aside className={cn(
        "bg-[#0b1120] border-r border-slate-800 transition-all duration-300 flex flex-col z-20 shadow-2xl",
        isSidebarOpen ? "w-72" : "w-0 overflow-hidden"
      )}>
        <div className="p-6 flex-1 overflow-y-auto">
          <div className="flex items-center gap-3 mb-8">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-600 p-2 rounded-xl shadow-lg">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-lg tracking-tight">Mapify - AI Mindmap Generator</h2>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Powered By Minimax</p>
            </div>
          </div>

          <button onClick={clearCanvas}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-600/10 text-blue-400 border border-blue-600/20 hover:bg-blue-600/20 transition-all mb-6">
            <Plus className="w-4 h-4" />
            <span className="text-sm font-semibold">New Brainstorm</span>
          </button>

          <div className="mb-6 p-4 rounded-xl bg-indigo-600/10 border border-indigo-600/20">
            <p className="text-[11px] font-bold text-indigo-400 uppercase tracking-widest mb-2">How to use</p>
            <ul className="text-[11px] text-slate-400 space-y-1.5 leading-relaxed">
              <li>1️⃣ Type a topic → click Branch</li>
              <li>2️⃣ Mind map generates instantly</li>
              <li>3️⃣ <span className="text-indigo-400 font-semibold">Click any node</span> to expand deeper with AI</li>
              <li>4️⃣ Export as PNG to share</li>
            </ul>
          </div>

          {history.length > 0 && (
            <div className="py-2">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold px-2 mb-2">Recent</p>
              {history.map((item, i) => (
                <button key={i} onClick={() => setInput(item)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-slate-800/50 text-slate-400 hover:text-slate-200 transition-all text-sm group">
                  <span className="flex items-center gap-3 truncate">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-700 group-hover:bg-blue-500 transition-colors shrink-0" />
                    <span className="truncate">{item}</span>
                  </span>
                  <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 shrink-0" />
                </button>
              ))}
            </div>
          )}

          <div className="mt-6 p-4 rounded-xl bg-slate-800/40 border border-slate-700/30">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-3">Branch Colors</p>
            <div className="grid grid-cols-4 gap-2">
              {BRANCH_COLORS.map((c, i) => (
                <div key={i} className="w-6 h-6 rounded-full" style={{ background: c.node }} />
              ))}
            </div>
            <p className="text-[10px] text-slate-500 mt-2">Each branch gets a unique color</p>
          </div>
        </div>

        <div className="p-4 border-t border-slate-800">
          <button onClick={handleExport}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-all">
            <Download className="w-4 h-4" /> Export as PNG
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col relative min-w-0">
        <header className="h-16 border-b border-slate-800/50 px-6 flex justify-between items-center bg-[#020617]/80 backdrop-blur-xl z-10">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2.5 hover:bg-slate-800 rounded-xl text-slate-400 transition-all">
              <Menu className="w-5 h-5" />
            </button>
            <div className="h-4 w-px bg-slate-800" />
            <h1 className="text-sm font-semibold text-slate-300">Brainstorming Session</h1>
            {expandingNodeId && (
              <div className="flex items-center gap-2 text-indigo-400 text-xs font-medium animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin" /> Expanding node with AI...
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleExport}
              className="flex items-center gap-2 bg-slate-800/50 hover:bg-slate-800 text-slate-300 px-4 py-2 rounded-xl text-xs font-bold transition-all border border-slate-700/50">
              <Download className="w-4 h-4" /> Export PNG
            </button>
            <button onClick={clearCanvas}
              className="flex items-center gap-2 bg-slate-800/50 hover:bg-red-900/30 text-slate-400 hover:text-red-400 px-4 py-2 rounded-xl text-xs font-bold transition-all border border-slate-700/50">
              <Trash2 className="w-4 h-4" /> Clear
            </button>
            <div className="h-4 w-px bg-slate-800 mx-1" />
            <a href="https://github.com" target="_blank" rel="noreferrer"
              className="p-2.5 hover:bg-slate-800 rounded-xl text-slate-400 transition-all">
              <Github className="w-5 h-5" />
            </a>
          </div>
        </header>

        <main className="flex-1 relative" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onConnect={onConnect} onInit={setRfInstance}
            onNodeClick={onNodeClick}
            fitView className="bg-[#020617]"
          >
            <Background color="#1e293b" gap={24} size={1} />
            <Controls className="!bg-slate-900 !border-slate-800 !rounded-xl !shadow-2xl overflow-hidden" />
            <MiniMap className="!bg-slate-900 !border-slate-800 !rounded-xl shadow-2xl overflow-hidden"
              maskColor="rgba(15,23,42,0.7)"
              nodeColor={n => n.id === 'root' ? '#6366f1' : '#334155'}
            />
          </ReactFlow>

          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-full max-w-2xl px-6">
            <div className="relative">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl blur opacity-20 hover:opacity-40 transition duration-500" />
              <div className="relative bg-slate-900/95 border border-slate-700/50 p-2 rounded-2xl shadow-2xl backdrop-blur-xl flex gap-3">
                <div className="flex-1 flex items-center px-4">
                  <Sparkles className={cn("w-5 h-5 mr-3 shrink-0 transition-all",
                    isLoading ? "text-blue-400 animate-pulse" : "text-slate-500")} />
                  <input type="text" value={input} onChange={e => setInput(e.target.value)}
                    placeholder="Describe a topic to explore..."
                    className="flex-1 bg-transparent border-none focus:ring-0 py-3 text-slate-100 placeholder:text-slate-500 text-sm font-medium outline-none"
                    onKeyDown={e => e.key === 'Enter' && handleGenerate()} />
                </div>
                <button onClick={handleGenerate} disabled={isLoading || !input.trim()}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl flex items-center gap-2 transition-all font-bold text-sm shadow-lg active:scale-95">
                  {isLoading
                    ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <><span>Branch</span><Send className="w-4 h-4" /></>}
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
