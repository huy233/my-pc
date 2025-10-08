"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type LineStyle = "solid" | "dashed";
type Tool = LineStyle | "brush" | "eraser" | null;

type Point = { x: number; y: number };

type Segment = {
  type: "segment";
  start: Point;
  end: Point;
  style: LineStyle;
  color: string;
  width: number;
};

type BrushPath = {
  type: "path";
  points: Point[];
  color: string;
  width: number;
};

type Shape = Segment | BrushPath;

type GeometryPageData = {
  id: string;
  name: string;
  shapes: Shape[];
  // optional view state persistence
  scale?: number;
  offset?: Point;
  createdAt: number;
  updatedAt: number;
};

export default function GeometryPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [currentTool, setCurrentTool] = useState<Tool>("solid");
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [previewEnd, setPreviewEnd] = useState<Point | null>(null);
  const [strokeColor, setStrokeColor] = useState<string>("#111827");
  const [strokeWidth, setStrokeWidth] = useState<number>(2);
  const [currentPath, setCurrentPath] = useState<Point[] | null>(null);
  const [snapPreview, setSnapPreview] = useState<Point | null>(null);
  const [hoverWorld, setHoverWorld] = useState<Point | null>(null);
  // viewport transform: screen = world * scale + offset
  const [scale, setScale] = useState<number>(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panLastRef = useRef<Point | null>(null);
  const [isErasing, setIsErasing] = useState(false);
  const [eraserSizePx, setEraserSizePx] = useState<number>(18);
  const [lastUndoneShape, setLastUndoneShape] = useState<Shape | null>(null);

  // multi-page management
  const [pages, setPages] = useState<GeometryPageData[]>([]);
  const [currentPageId, setCurrentPageId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState<boolean>(false);

  const storageKey = "painted-geometry-pages";
  const storageCurrentKey = "painted-geometry-current";

  const generateId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

  const worldToScreen = useCallback(
    (p: Point): Point => ({ x: p.x * scale + offset.x, y: p.y * scale + offset.y }),
    [scale, offset]
  );

  const screenToWorld = useCallback(
    (p: Point): Point => ({ x: (p.x - offset.x) / scale, y: (p.y - offset.y) / scale }),
    [scale, offset]
  );

  const resizeCanvasToContainer = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }, []);

  const drawAll = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    // clear to white
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // draw geometry grid background (in world coords)
    const width = canvas.width;
    const height = canvas.height;
    const gridWorld = 40; // world units between grid lines
    const gridPx = gridWorld * scale;
    if (gridPx >= 8) {
      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#e5e7eb"; // gray-200
      ctx.setLineDash([]);

      // vertical lines
      const startXWorld = Math.floor((-offset.x) / gridPx) * gridWorld;
      const endXWorld = screenToWorld({ x: width, y: 0 }).x + gridWorld;
      for (let xw = startXWorld; xw <= endXWorld; xw += gridWorld) {
        const xs = worldToScreen({ x: xw, y: 0 }).x;
        ctx.beginPath();
        ctx.moveTo(xs, 0);
        ctx.lineTo(xs, height);
        ctx.stroke();
      }

      // horizontal lines
      const startYWorld = Math.floor((-offset.y) / gridPx) * gridWorld;
      const endYWorld = screenToWorld({ x: 0, y: height }).y + gridWorld;
      for (let yw = startYWorld; yw <= endYWorld; yw += gridWorld) {
        const ys = worldToScreen({ x: 0, y: yw }).y;
        ctx.beginPath();
        ctx.moveTo(0, ys);
        ctx.lineTo(width, ys);
        ctx.stroke();
      }

      // axes at world origin
      ctx.strokeStyle = "#c7d2fe"; // indigo-200 for axes
      ctx.lineWidth = 1.5;
      const originX = worldToScreen({ x: 0, y: 0 }).x;
      const originY = worldToScreen({ x: 0, y: 0 }).y;
      ctx.beginPath();
      ctx.moveTo(0, originY);
      ctx.lineTo(width, originY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(originX, 0);
      ctx.lineTo(originX, height);
      ctx.stroke();
      ctx.restore();
    }

    // draw existing shapes
    for (const shape of shapes) {
      if (shape.type === "segment") {
        const seg = shape;
        ctx.lineWidth = seg.width * scale; // keep visual width relative to zoom
        ctx.strokeStyle = seg.color;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        if (seg.style === "dashed") {
          ctx.setLineDash([10, 8].map((v) => v * scale));
        } else {
          ctx.setLineDash([]);
        }
        ctx.beginPath();
        const s0 = worldToScreen(seg.start);
        const s1 = worldToScreen(seg.end);
        ctx.moveTo(s0.x, s0.y);
        ctx.lineTo(s1.x, s1.y);
        ctx.stroke();
      } else if (shape.type === "path") {
        const path = shape;
        if (path.points.length < 2) continue;
        ctx.lineWidth = path.width * scale;
        ctx.strokeStyle = path.color;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.setLineDash([]);
        ctx.beginPath();
        const p0 = worldToScreen(path.points[0]);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < path.points.length; i++) {
          const p = worldToScreen(path.points[i]);
          ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
    }

    // draw preview segment if any
    // preview for segment
    if (isDrawing && startPoint && previewEnd && (currentTool === "solid" || currentTool === "dashed")) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth * scale;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (currentTool === "dashed") {
        ctx.setLineDash([10, 8].map((v) => v * scale));
      } else {
        ctx.setLineDash([]);
      }
      ctx.beginPath();
      const s0 = worldToScreen(startPoint);
      const s1 = worldToScreen(previewEnd);
      ctx.moveTo(s0.x, s0.y);
      ctx.lineTo(s1.x, s1.y);
      ctx.stroke();
      ctx.setLineDash([]);
      // draw snap indicator if any
      if (snapPreview) {
        const sp = worldToScreen(snapPreview);
        ctx.fillStyle = "#10b981"; // emerald-500
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, Math.max(3, 3 * scale), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // preview for brush
    if (isDrawing && currentTool === "brush" && currentPath && currentPath.length >= 1) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth * scale;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.setLineDash([]);
      ctx.beginPath();
      const p0 = worldToScreen(currentPath[0]);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < currentPath.length; i++) {
        const p = worldToScreen(currentPath[i]);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    // draw eraser preview
    if (currentTool === "eraser" && hoverWorld) {
      const c = worldToScreen(hoverWorld);
      const r = eraserSizePx;
      ctx.save();
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.restore();
    }
  }, [shapes, isDrawing, startPoint, previewEnd, currentTool, strokeColor, strokeWidth, scale, offset, worldToScreen, screenToWorld, currentPath]);

  // snapping helpers
  const getAllEndpoints = useCallback((): Point[] => {
    const endpoints: Point[] = [];
    for (const shape of shapes) {
      if (shape.type === "segment") {
        endpoints.push(shape.start, shape.end);
      } else if (shape.type === "path") {
        if (shape.points.length > 0) {
          endpoints.push(shape.points[0], shape.points[shape.points.length - 1]);
        }
      }
    }
    return endpoints;
  }, [shapes]);

  const snapToEndpoints = useCallback(
    (world: Point): Point | null => {
      const tolPx = 12; // pixel tolerance
      const tolSq = tolPx * tolPx;
      const worldToPx = (p: Point) => worldToScreen(p);
      let best: { p: Point; d2: number } | null = null;
      for (const ep of getAllEndpoints()) {
        const a = worldToPx(world);
        const b = worldToPx(ep);
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 <= tolSq && (!best || d2 < best.d2)) {
          best = { p: ep, d2 };
        }
      }
      return best ? best.p : null;
    },
    [getAllEndpoints, worldToScreen]
  );

  const snapAxisFromStart = useCallback((start: Point, end: Point): Point => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.hypot(dx, dy) || 1;
    const angle = Math.atan2(dy, dx);
    const deg = (angle * 180) / Math.PI;
    const near = (a: number, b: number, t = 10) => Math.abs(((a - b + 180 + 360) % 360) - 180) <= t;
    if (near(deg, 0) || near(deg, 180)) {
      return { x: end.x, y: start.y };
    }
    if (near(deg, 90) || near(deg, -90)) {
      return { x: start.x, y: end.y };
    }
    // optional 45-degree snapping
    const forty5 = [45, 135, -45, -135];
    for (const t of forty5) {
      if (near(deg, t)) {
        const s = Math.SQRT1_2 * len;
        const sx = start.x + Math.cos((t * Math.PI) / 180) * len;
        const sy = start.y + Math.sin((t * Math.PI) / 180) * len;
        return { x: sx, y: sy };
      }
    }
    return end;
  }, []);

  useEffect(() => {
    resizeCanvasToContainer();
    drawAll();
  }, [resizeCanvasToContainer, drawAll]);

  useEffect(() => {
    const onResize = () => {
      resizeCanvasToContainer();
      drawAll();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [resizeCanvasToContainer, drawAll]);

  // load/save pages
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      let loaded: GeometryPageData[] = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(loaded) || loaded.length === 0) {
        loaded = [{ id: generateId(), name: "Trang 1", shapes: [], scale: 1, offset: { x: 0, y: 0 }, createdAt: Date.now(), updatedAt: Date.now() }];
      }
      setPages(loaded);
      const cur = localStorage.getItem(storageCurrentKey);
      const chosen = cur && loaded.find((p) => p.id === cur) ? cur : loaded[0].id;
      setCurrentPageId(chosen);
      const page = loaded.find((p) => p.id === chosen)!;
      setShapes(page.shapes || []);
      if (page.scale) setScale(page.scale);
      if (page.offset) setOffset(page.offset);
      setIsDirty(false);
    } catch {}
  }, []);

  const savePagesToStorage = useCallback((nextPages: GeometryPageData[], nextCurrentId: string | null) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(nextPages));
      if (nextCurrentId) localStorage.setItem(storageCurrentKey, nextCurrentId);
    } catch {}
  }, []);

  const getCanvasPoint = (evt: React.MouseEvent<HTMLCanvasElement, MouseEvent>): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  };

  const handleMouseDown = (evt: React.MouseEvent<HTMLCanvasElement>) => {
    const pScreen = getCanvasPoint(evt);
    if (currentTool === "eraser") {
      const pWorld = screenToWorld(pScreen);
      setHoverWorld(pWorld);
      setIsErasing(true);
      eraseAt(pWorld);
      return;
    }
    if (!currentTool) {
      // start panning
      setIsPanning(true);
      panLastRef.current = pScreen;
      return;
    }
    const pWorld = screenToWorld(pScreen);
    if (currentTool === "brush") {
      setCurrentPath([pWorld]);
      setIsDrawing(true);
      return;
    }
    // snap start to nearest endpoint if within tolerance
    const snappedStart = snapToEndpoints(pWorld) ?? pWorld;
    setStartPoint(snappedStart);
    setPreviewEnd(snappedStart);
    setIsDrawing(true);
  };

  const handleMouseMove = (evt: React.MouseEvent<HTMLCanvasElement>) => {
    const pScreen = getCanvasPoint(evt);
    setHoverWorld(screenToWorld(pScreen));
    if (isPanning) {
      const last = panLastRef.current;
      if (last) {
        const dx = pScreen.x - last.x;
        const dy = pScreen.y - last.y;
        setOffset((o) => ({ x: o.x + dx, y: o.y + dy }));
      }
      panLastRef.current = pScreen;
      requestAnimationFrame(drawAll);
      return;
    }
    if (isErasing && currentTool === "eraser") {
      const pWorld = screenToWorld(pScreen);
      eraseAt(pWorld);
      requestAnimationFrame(drawAll);
      return;
    }
    if (!isDrawing) return;
    const pWorld = screenToWorld(pScreen);
    if (currentTool === "brush") {
      setCurrentPath((prev) => (prev ? [...prev, pWorld] : [pWorld]));
      requestAnimationFrame(drawAll);
      return;
    }
    // for segment preview: endpoint snapping and axis snapping
    const snappedEnd = snapToEndpoints(pWorld) ?? (startPoint ? snapAxisFromStart(startPoint, pWorld) : pWorld);
    setPreviewEnd(snappedEnd);
    setSnapPreview(snapToEndpoints(pWorld));
    requestAnimationFrame(drawAll);
  };

  const handleMouseUp = (evt: React.MouseEvent<HTMLCanvasElement>) => {
    if (isErasing) {
      setIsErasing(false);
      return;
    }
    if (isPanning) {
      setIsPanning(false);
      panLastRef.current = null;
      return;
    }
    if (!isDrawing) return;
    if (currentTool === "brush") {
      setShapes((prev) => [
        ...prev,
        { type: "path", points: currentPath ?? [], color: strokeColor, width: strokeWidth },
      ]);
      setIsDirty(true);
      setLastUndoneShape(null);
      setCurrentPath(null);
      setIsDrawing(false);
      return;
    }
    if (!startPoint || !(currentTool === "solid" || currentTool === "dashed")) return;
    const endWorld = screenToWorld(getCanvasPoint(evt));
    const snappedEnd = snapToEndpoints(endWorld) ?? snapAxisFromStart(startPoint, endWorld);
    setShapes((prev) => [
      ...prev,
      { type: "segment", start: startPoint, end: snappedEnd, style: currentTool, color: strokeColor, width: strokeWidth },
    ]);
    setIsDirty(true);
    setLastUndoneShape(null);
    setIsDrawing(false);
    setStartPoint(null);
    setPreviewEnd(null);
    setSnapPreview(null);
  };

  const handleMouseLeave = () => {
    if (isPanning) {
      setIsPanning(false);
      panLastRef.current = null;
      return;
    }
    if (isErasing) {
      setIsErasing(false);
    }
    if (!isDrawing) return;
    setIsDrawing(false);
    setStartPoint(null);
    setPreviewEnd(null);
    setCurrentPath(null);
    setSnapPreview(null);
    drawAll();
  };

  const handleWheel = (evt: React.WheelEvent<HTMLCanvasElement>) => {
    evt.preventDefault();
    const delta = -evt.deltaY; // wheel up -> zoom in
    const zoomFactor = Math.exp(delta * 0.001);
    const oldScale = scale;
    const newScale = Math.min(6, Math.max(0.2, oldScale * zoomFactor));
    if (newScale === oldScale) return;

    // keep mouse point stable during zoom
    const mouseScreen = getCanvasPoint(evt as unknown as React.MouseEvent<HTMLCanvasElement>);
    const mouseWorld = screenToWorld(mouseScreen);
    const newOffset = {
      x: mouseScreen.x - mouseWorld.x * newScale,
      y: mouseScreen.y - mouseWorld.y * newScale,
    };
    setScale(newScale);
    setOffset(newOffset);
    requestAnimationFrame(drawAll);
  };

  const undo = () => {
    setShapes((prev) => {
      if (prev.length === 0) return prev;
      const removed = prev[prev.length - 1];
      setLastUndoneShape(removed);
      setIsDirty(true);
      return prev.slice(0, -1);
    });
  };

  const redo = () => {
    if (!lastUndoneShape) return;
    setShapes((prev) => [...prev, lastUndoneShape]);
    setLastUndoneShape(null);
    setIsDirty(true);
  };

  const clearAll = () => {
    setShapes([]);
    setIsDirty(true);
    setLastUndoneShape(null);
  };

  const exportPNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "painted-geometry.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  // eraser helpers
  const distancePointToSegment = (p: Point, a: Point, b: Point): number => {
    const ax = a.x, ay = a.y, bx = b.x, by = b.y;
    const abx = bx - ax, aby = by - ay;
    const apx = p.x - ax, apy = p.y - ay;
    const abLen2 = abx * abx + aby * aby;
    if (abLen2 === 0) {
      const dx = p.x - ax, dy = p.y - ay;
      return Math.hypot(dx, dy);
    }
    let t = (apx * abx + apy * aby) / abLen2;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * abx, cy = ay + t * aby;
    return Math.hypot(p.x - cx, p.y - cy);
  };

  const eraseAt = (worldPoint: Point) => {
    const radiusWorld = eraserSizePx / scale;
    setShapes((prev) => {
      let changed = false;
      const kept: Shape[] = [];
      for (const s of prev) {
        if (s.type === "segment") {
          const d = distancePointToSegment(worldPoint, s.start, s.end);
          if (d <= radiusWorld) {
            changed = true;
            continue;
          }
          kept.push(s);
        } else {
          const pts = s.points;
          if (pts.length <= 1) {
            const d0 = pts[0] ? Math.hypot(worldPoint.x - pts[0].x, worldPoint.y - pts[0].y) : Infinity;
            if (d0 <= radiusWorld) {
              changed = true;
              continue;
            }
            kept.push(s);
          } else {
            let hit = false;
            for (let i = 1; i < pts.length; i++) {
              const d = distancePointToSegment(worldPoint, pts[i - 1], pts[i]);
              if (d <= radiusWorld) {
                hit = true;
                break;
              }
            }
            if (hit) {
              changed = true;
              continue;
            }
            kept.push(s);
          }
        }
      }
      if (changed) setIsDirty(true);
      return kept;
    });
    setLastUndoneShape(null);
  };

  // page operations
  const commitSave = () => {
    if (!currentPageId) return;
    const now = Date.now();
    setPages((prev) => {
      const next = prev.map((p) => (p.id === currentPageId ? { ...p, shapes, scale, offset, updatedAt: now } : p));
      savePagesToStorage(next, currentPageId);
      return next;
    });
    setIsDirty(false);
  };

  const createNewPage = () => {
    const name = prompt("Tên trang mới:", `Trang ${pages.length + 1}`)?.trim();
    if (!name) return;
    const id = generateId();
    const now = Date.now();
    const newPage: GeometryPageData = { id, name, shapes: [], scale: 1, offset: { x: 0, y: 0 }, createdAt: now, updatedAt: now };
    const nextPages = [newPage, ...pages];
    setPages(nextPages);
    setCurrentPageId(id);
    setShapes([]);
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setIsDirty(false);
    savePagesToStorage(nextPages, id);
  };

  const saveAsNewPage = () => {
    if (!currentPageId) return;
    const base = pages.find((p) => p.id === currentPageId);
    if (!base) return;
    const name = prompt("Lưu thành tệp mới (đặt tên):", `${base.name} (bản sao)`)?.trim();
    if (!name) return;
    const id = generateId();
    const now = Date.now();
    const clone: GeometryPageData = {
      id,
      name,
      shapes: [...shapes],
      scale,
      offset,
      createdAt: now,
      updatedAt: now,
    };
    const nextPages = [clone, ...pages];
    setPages(nextPages);
    setCurrentPageId(id);
    setIsDirty(false);
    savePagesToStorage(nextPages, id);
  };

  const renameCurrentPage = () => {
    if (!currentPageId) return;
    const page = pages.find((p) => p.id === currentPageId);
    if (!page) return;
    const name = prompt("Đổi tên trang:", page.name)?.trim();
    if (!name) return;
    const next = pages.map((p) => (p.id === currentPageId ? { ...p, name, updatedAt: Date.now() } : p));
    setPages(next);
    savePagesToStorage(next, currentPageId);
  };

  const deleteCurrentPage = () => {
    if (!currentPageId) return;
    if (!confirm("Xóa trang hiện tại?")) return;
    const remain = pages.filter((p) => p.id !== currentPageId);
    if (remain.length === 0) {
      const id = generateId();
      const now = Date.now();
      const fresh: GeometryPageData = { id, name: "Trang 1", shapes: [], scale: 1, offset: { x: 0, y: 0 }, createdAt: now, updatedAt: now };
      setPages([fresh]);
      setCurrentPageId(id);
      setShapes([]);
      setScale(1);
      setOffset({ x: 0, y: 0 });
      setIsDirty(false);
      savePagesToStorage([fresh], id);
      return;
    }
    const nextCurrent = remain[0].id;
    setPages(remain);
    setCurrentPageId(nextCurrent);
    const page = remain[0];
    setShapes(page.shapes || []);
    setScale(page.scale || 1);
    setOffset(page.offset || { x: 0, y: 0 });
    setIsDirty(false);
    savePagesToStorage(remain, nextCurrent);
  };

  const changeCurrentPage = (id: string) => {
    if (id === currentPageId) return;
    const page = pages.find((p) => p.id === id);
    if (!page) return;
    // ask to save if dirty
    if (isDirty && currentPageId) {
      const ok = confirm("Lưu thay đổi trước khi chuyển trang?");
      if (ok) commitSave();
    }
    setCurrentPageId(id);
    setShapes(page.shapes || []);
    setScale(page.scale || 1);
    setOffset(page.offset || { x: 0, y: 0 });
    setIsDirty(false);
    savePagesToStorage(pages, id);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsDrawing(false);
        setStartPoint(null);
        setPreviewEnd(null);
        drawAll();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.shiftKey && e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y")) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawAll]);

  return (
    <div className="min-h-screen w-full">
      {/* Top bar */}
      <div className="sticky top-0 z-10 w-full border-b border-black/10 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-gradient-to-br from-indigo-500 to-pink-500" />
            <span className="text-sm font-semibold tracking-wide text-gray-800">Painted Geometry</span>
          </div>
          <div className="flex items-center gap-2">
            {/* pages dropdown */}
            <div className="flex items-center gap-2 mr-2">
              <select
                value={currentPageId ?? ""}
                onChange={(e) => changeCurrentPage(e.target.value)}
                className="h-9 rounded-md border border-black/10 bg-white px-2 text-sm"
                title="Chọn trang"
              >
                {pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {isDirty && <span className="text-xs text-amber-600">(Chưa lưu)</span>}
            </div>

            {/* line style */}
            <div className="flex items-center gap-1 rounded-md border border-black/10 p-1 bg-white">
              <button
                type="button"
                aria-label="Nét liền"
                onClick={() => setCurrentTool((s) => (s === "solid" ? null : "solid"))}
                className={`h-9 w-9 rounded-md transition flex items-center justify-center ${
                  currentTool === "solid" ? "bg-indigo-50 ring-1 ring-indigo-300" : "hover:bg-gray-50"
                }`}
                title="Nét liền"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2">
                  <path d="M3 12 L21 12" />
                </svg>
              </button>
              <button
                type="button"
                aria-label="Nét đứt"
                onClick={() => setCurrentTool((s) => (s === "dashed" ? null : "dashed"))}
                className={`h-9 w-9 rounded-md transition flex items-center justify-center ${
                  currentTool === "dashed" ? "bg-indigo-50 ring-1 ring-indigo-300" : "hover:bg-gray-50"
                }`}
                title="Nét đứt"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2" strokeDasharray="5 6">
                  <path d="M3 12 L21 12" />
                </svg>
              </button>
              <button
                type="button"
                aria-label="Bút lông"
                onClick={() => setCurrentTool((s) => (s === "brush" ? null : "brush"))}
                className={`h-9 w-9 rounded-md transition flex items-center justify-center ${
                  currentTool === "brush" ? "bg-indigo-50 ring-1 ring-indigo-300" : "hover:bg-gray-50"
                }`}
                title="Bút lông"
              >
                {/* brush icon */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2">
                  <path d="M20.84 4.61a2.5 2.5 0 0 0-3.53 0L9 12.92V15h2.08l8.31-8.31a2.5 2.5 0 0 0 0-3.53z" />
                  <path d="M7 17c-1 0-3 1-3 3s2 3 3 3 3-1 3-3-1-3-3-3z" />
                </svg>
              </button>
              <button
                type="button"
                aria-label="Cục tẩy"
                onClick={() => setCurrentTool((s) => (s === "eraser" ? null : "eraser"))}
                className={`h-9 w-9 rounded-md transition flex items-center justify-center ${
                  currentTool === "eraser" ? "bg-indigo-50 ring-1 ring-indigo-300" : "hover:bg-gray-50"
                }`}
                title="Cục tẩy"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2">
                  <path d="m3 17 6-6 8 8H7z" />
                  <path d="m14 10 4-4a2.828 2.828 0 0 1 4 4l-4 4" />
                </svg>
              </button>
            </div>

            {/* color */}
            <label className="ml-2 text-xs text-gray-800">Màu</label>
            <input
              type="color"
              value={strokeColor}
              onChange={(e) => setStrokeColor(e.target.value)}
              className="h-9 w-9 p-1 rounded-md border border-black/10 bg-white cursor-pointer"
              aria-label="Chọn màu"
            />

            {/* width */}
            <label className="ml-3 text-xs text-gray-800">Độ dày</label>
            <input
              type="range"
              min={1}
              max={12}
              value={strokeWidth}
              onChange={(e) => setStrokeWidth(parseInt(e.target.value, 10))}
              className="w-32 accent-indigo-600"
              aria-label="Độ dày nét"
            />
            <span className="text-xs text-gray-800 w-6 text-right">{strokeWidth}</span>

            {/* eraser button with size dropdown */}
            <div className="relative">
              <details className="group">
                <summary className={`h-9 w-9 rounded-md transition flex items-center justify-center border border-black/10 bg-white hover:bg-gray-50 cursor-pointer list-none ${
                  currentTool === "eraser" ? "ring-1 ring-indigo-300" : ""
                }`} title="Cục tẩy">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2">
                    <path d="m3 17 6-6 8 8H7z" />
                    <path d="m14 10 4-4a2.828 2.828 0 0 1 4 4l-4 4" />
                  </svg>
                </summary>
                <div className="absolute right-0 mt-2 w-56 rounded-lg border border-black/10 bg-white p-3 shadow-lg z-20 text-gray-800">
                  <div className="mb-2 text-xs font-medium">Kích thước tẩy: {eraserSizePx}px</div>
                  <input
                    type="range"
                    min={6}
                    max={48}
                    value={eraserSizePx}
                    onChange={(e) => setEraserSizePx(parseInt(e.target.value, 10))}
                    className="w-full accent-indigo-600"
                    aria-label="Kích thước tẩy"
                  />
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setCurrentTool((s) => (s === "eraser" ? null : "eraser"))}
                      className="h-8 px-3 rounded-md border border-black/10 bg-white hover:bg-gray-50 text-xs text-gray-800"
                    >
                      Chọn tẩy
                    </button>
                  </div>
                </div>
              </details>
            </div>

            {/* actions */}
            <div className="ml-3 flex items-center gap-2">
              {/* File dropdown */}
              <div className="relative">
                <details className="group">
                  <summary className="h-9 px-3 rounded-md border border-black/10 bg-white hover:bg-gray-50 text-sm text-gray-800 flex items-center gap-2 cursor-pointer list-none">
                    Tệp
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="transition group-open:rotate-180">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </summary>
                  <div className="absolute right-0 mt-2 w-56 rounded-lg border border-black/10 bg-white p-1 shadow-lg z-20">
                    <button type="button" onClick={createNewPage} className="w-full text-left px-3 py-2 rounded-md hover:bg-gray-50 text-sm text-gray-800">Tạo tệp</button>
                    <button type="button" onClick={commitSave} className="w-full text-left px-3 py-2 rounded-md hover:bg-gray-50 text-sm text-gray-800">Lưu tệp</button>
                    <button type="button" onClick={saveAsNewPage} className="w-full text-left px-3 py-2 rounded-md hover:bg-gray-50 text-sm text-gray-800">Lưu thành tệp mới</button>
                    <button type="button" onClick={renameCurrentPage} className="w-full text-left px-3 py-2 rounded-md hover:bg-gray-50 text-sm text-gray-800">Đổi tên</button>
                    <button type="button" onClick={deleteCurrentPage} className="w-full text-left px-3 py-2 rounded-md hover:bg-gray-50 text-red-600 text-sm">Xóa (có xác nhận)</button>
                  </div>
                </details>
              </div>
              {/* quick undo/redo icons */}
              <button
                type="button"
                onClick={undo}
                className="h-9 w-9 rounded-md border border-black/10 bg-white hover:bg-gray-50 flex items-center justify-center"
                title="Hoàn tác (Ctrl+Z)"
                aria-label="Hoàn tác"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2">
                  <path d="M11 4 7 8l4 4" />
                  <path d="M7 8h7a4 4 0 1 1 0 8h-1" />
                </svg>
              </button>
              <button
                type="button"
                onClick={redo}
                className="h-9 w-9 rounded-md border border-black/10 bg-white hover:bg-gray-50 flex items-center justify-center"
                title="Làm lại (Ctrl+Shift+Z / Ctrl+Y)"
                aria-label="Làm lại"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2">
                  <path d="m13 4 4 4-4 4" />
                  <path d="M17 8H10a4 4 0 1 0 0 8h1" />
                </svg>
              </button>
              <button
                type="button"
                onClick={undo}
                className="h-9 px-3 rounded-md border border-black/10 bg-white hover:bg-gray-50 text-sm text-gray-800"
                title="Hoàn tác (Ctrl+Z)"
              >
                Hoàn tác
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="h-9 px-3 rounded-md border border-black/10 bg-white hover:bg-gray-50 text-sm text-gray-800"
                title="Xóa hết"
              >
                Xóa
              </button>
              <button
                type="button"
                onClick={exportPNG}
                className="h-9 px-3 rounded-md bg-indigo-600 text-white hover:bg-indigo-500 text-sm shadow-sm text-gray-800/0"
                title="Xuất PNG"
              >
                Xuất PNG
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Canvas container fills the remaining space */}
      <div ref={containerRef} className="relative w-full" style={{ height: "calc(100vh - 56px)" }}>
        <canvas
          ref={canvasRef}
          className="block w-full h-full cursor-crosshair"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onWheel={handleWheel}
        />
        <div className="pointer-events-none absolute bottom-3 right-4 rounded-md bg-white/10 border border-white/10 px-2 py-1 text-xs text-indigo-100 shadow-sm backdrop-blur-sm">
          Zoom: {(scale * 100).toFixed(0)}%
        </div>
      </div>
    </div>
  );
}


