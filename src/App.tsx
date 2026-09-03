import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Download,
  FilePlus,
  FolderOpen,
  Pencil,
  Play,
  Plus,
  Save,
  Square,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import {
  barAreaCm2,
  barCount,
  columnFloors,
  floorElevations,
  formatBarLabel,
  sectionFor,
  steelRatioPercent,
} from "./lib/calc";
import { createSampleProject, emptySection } from "./lib/sample";
import { DIAMETERS, type Column, type Floor, type FloorSection, type Project } from "./lib/types";
import "./App.css";

const STORE_KEY = "thep-cot-project-v1";

type DialogId = "none" | "floors" | "floorEdit" | "column" | "rebar";

function cloneProject(project: Project): Project {
  return JSON.parse(JSON.stringify(project)) as Project;
}

export default function App() {
  const [project, setProject] = useState<Project>(() => createSampleProject());
  const [selectedColumnId, setSelectedColumnId] = useState("C1");
  const [selectedFloorId, setSelectedFloorId] = useState(1);
  const [dialog, setDialog] = useState<DialogId>("none");
  const [draftFloorCount, setDraftFloorCount] = useState(3);
  const [draftFloorHeight, setDraftFloorHeight] = useState(4150);
  const [draftBeamHeight, setDraftBeamHeight] = useState(500);
  const [status, setStatus] = useState<string | null>("Mẫu 3 tầng / 5 cột đã sẵn sàng.");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pdfUrl, setPdfUrl] = useState("");
  const [applyUpper, setApplyUpper] = useState(true);

  const persist = useCallback((next: Project) => {
    setProject(next);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const loaded = JSON.parse(raw) as Project;
        if (loaded.floors?.length && loaded.columns?.length) {
          setProject(loaded);
          setSelectedColumnId(loaded.columns[loaded.columns.length - 1]?.id ?? "C1");
        }
      }
    } catch {
      /* keep sample */
    }
  }, []);

  const selectedColumn = useMemo(
    () => project.columns.find((column) => column.id === selectedColumnId) ?? project.columns[0],
    [project.columns, selectedColumnId],
  );
  const selectedFloor = useMemo(
    () => project.floors.find((floor) => floor.id === selectedFloorId) ?? project.floors[0],
    [project.floors, selectedFloorId],
  );
  const selectedSection = sectionFor(selectedColumn, selectedFloor.id);
  const elevations = floorElevations(project.floors);

  function patchSection(partial: Partial<FloorSection>, applyUpper: boolean) {
    const next = cloneProject(project);
    const column = next.columns.find((item) => item.id === selectedColumn.id);
    if (!column) return;
    const current = { ...sectionFor(column, selectedFloor.id), ...partial };
    column.sections[selectedFloor.id] = current;
    if (applyUpper) {
      next.floors
        .filter((floor) => floor.id > selectedFloor.id && floor.id <= column.endFloor)
        .forEach((floor) => {
          column.sections[floor.id] = { ...current };
        });
    }
    persist(next);
  }

  function patchColumn(partial: Partial<Column>) {
    persist({
      ...project,
      columns: project.columns.map((column) =>
        column.id === selectedColumn.id ? { ...column, ...partial } : column,
      ),
    });
  }

  function applyFloorTemplate() {
    const count = Math.max(1, Math.min(20, draftFloorCount));
    const floors: Floor[] = Array.from({ length: count }, (_, index) => ({
      id: index + 1,
      name: String(index + 1),
      heightMm: index === 0 ? draftFloorHeight : Math.max(draftFloorHeight - index * 250, 3200),
      beamHeightMm: index === count - 1 ? Math.max(draftBeamHeight - 50, 350) : draftBeamHeight,
    }));
    const next = cloneProject(project);
    next.floors = floors;
    next.columns = next.columns.map((column) => {
      const sections: Record<number, FloorSection> = {};
      floors.forEach((floor) => {
        sections[floor.id] = column.sections[floor.id] ?? emptySection();
      });
      return {
        ...column,
        startFloor: 1,
        endFloor: count,
        sections,
      };
    });
    persist(next);
    setSelectedFloorId(1);
    setDialog("floorEdit");
    setStatus(`Đã tạo ${count} tầng.`);
  }

  function addColumn() {
    const id = `C${project.columns.length + 1}`;
    const sections: Record<number, FloorSection> = {};
    project.floors.forEach((floor) => {
      sections[floor.id] = emptySection();
    });
    const column: Column = {
      id,
      name: id,
      quantity: 1,
      startFloor: 1,
      endFloor: project.floors.length,
      shape: "HCN",
      sections,
    };
    persist({ ...project, columns: [...project.columns, column] });
    setSelectedColumnId(id);
    setDialog("column");
  }

  function copyColumn() {
    const copy: Column = cloneProject({ floors: [], columns: [selectedColumn] }).columns[0];
    copy.id = `${selectedColumn.name}-copy`;
    copy.name = copy.id;
    persist({ ...project, columns: [...project.columns, copy] });
    setSelectedColumnId(copy.id);
  }

  function deleteColumn() {
    if (project.columns.length <= 1) return;
    const columns = project.columns.filter((column) => column.id !== selectedColumn.id);
    persist({ ...project, columns });
    setSelectedColumnId(columns[0].id);
  }

  function moveColumn(dir: "top" | "up" | "down" | "bottom") {
    const columns = [...project.columns];
    const index = columns.findIndex((column) => column.id === selectedColumn.id);
    if (index < 0) return;
    const [item] = columns.splice(index, 1);
    if (dir === "top") columns.unshift(item);
    if (dir === "bottom") columns.push(item);
    if (dir === "up") columns.splice(Math.max(0, index - 1), 0, item);
    if (dir === "down") columns.splice(Math.min(columns.length, index + 1), 0, item);
    persist({ ...project, columns });
  }

  function saveJson() {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cot-shopdrawing.json";
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Đã lưu file JSON.");
  }

  function openJson() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const loaded = JSON.parse(await file.text()) as Project;
        persist(loaded);
        setSelectedColumnId(loaded.columns[0]?.id ?? "C1");
        setStatus(`Đã mở ${file.name}`);
      } catch {
        setError("Không đọc được file JSON.");
      }
    };
    input.click();
  }

  async function exportPdf() {
    setBusy(true);
    setError(null);
    setStatus("Đang tạo bản vẽ PDF…");
    try {
      const fontRes = await Promise.all([
        fetch("/fonts/BeVietnamPro-Regular.ttf"),
        fetch("/fonts/BeVietnamPro-Bold.ttf"),
      ]);
      if (fontRes.some((res) => !res.ok)) {
        throw new Error("Không tải được font chữ cho PDF.");
      }
      const [{ downloadPdf, generateColumnPdf }, regular, bold] = await Promise.all([
        import("./lib/pdf"),
        fontRes[0].arrayBuffer(),
        fontRes[1].arrayBuffer(),
      ]);
      const bytes = await generateColumnPdf(project, { regular, bold });
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      const url = downloadPdf(bytes, "output.pdf");
      setPdfUrl(url);
      setStatus("Đã xuất output.pdf — kiểm tra thư mục Tải xuống.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Không xuất được PDF.";
      setError(message);
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  const steel = barCount(selectedSection) * barAreaCm2(selectedSection.mainDia);
  const ratio = steelRatioPercent(selectedSection);

  function newProject() {
    persist(createSampleProject());
    setSelectedColumnId("C1");
    setSelectedFloorId(1);
    setPdfUrl("");
    setError(null);
    setStatus("Đã tạo dự án mới.");
  }

  function saveProject() {
    persist(project);
    setStatus("Đã lưu trên trình duyệt.");
  }

  return (
    <div className="app-root">
      <header className="site-header">
        <div className="brand">
          <a href="https://www.giahuy.net/" target="_blank" rel="noopener noreferrer" title="GiaHuy.Net">
            <img src="/giahuy-logo.png" alt="GiaHuy" width={171} height={47} />
          </a>
          <div className="brand-copy">
            <div className="brand-title">Shop drawing thép cột</div>
            <div className="brand-sub">Nhập tầng, tiết diện cột và thép, bấm Xuất PDF để xem bản vẽ.</div>
          </div>
        </div>
        <div className="header-actions">
          <button type="button" className="hdr-btn hdr-new" onClick={newProject}>
            <FilePlus size={16} /> Mới
          </button>
          <button type="button" className="hdr-btn hdr-save" onClick={saveProject}>
            <Save size={16} /> Lưu
          </button>
          <button type="button" className="hdr-btn hdr-pdf" onClick={exportPdf} disabled={busy}>
            <Download size={16} /> {busy ? "Đang xuất…" : "Xuất PDF"}
          </button>
        </div>
      </header>

      <div className="app-shell">
      <aside className="sidebar">
        <div className="icon-grid">
          <button type="button" className="tool-button" onClick={openJson}>
            <FolderOpen size={18} />
            Open
          </button>
          <button type="button" className="tool-button" onClick={saveJson}>
            <Save size={18} />
            Save As
          </button>
          <button type="button" className="tool-button" onClick={() => setDialog("floors")}>
            <Pencil size={18} />
            Tầng
          </button>
          <button type="button" className="tool-button" onClick={() => setDialog("column")}>
            <Wrench size={18} />
            Nhóm
          </button>
          <button type="button" className="tool-button" onClick={() => setDialog("floorEdit")}>
            <Square size={18} />
            Mặt bằng
          </button>
          <button type="button" className="tool-button" onClick={exportPdf} disabled={busy}>
            <Download size={18} />
            AutoCAD
          </button>
        </div>

        <div className="mini-actions">
          <button type="button" onClick={addColumn}>
            <Plus size={14} /> Add
          </button>
          <button type="button" onClick={() => setDialog("column")}>
            <Pencil size={14} /> Edit
          </button>
          <button type="button" onClick={copyColumn}>
            <Copy size={14} /> Copy
          </button>
          <button type="button" className="danger" onClick={deleteColumn}>
            <Trash2 size={14} /> Del
          </button>
        </div>

        <div className="list-wrap">
          <div className="column-list">
            {project.columns.map((column) => (
              <button
                key={column.id}
                type="button"
                className={column.id === selectedColumnId ? "column-row active" : "column-row"}
                onClick={() => setSelectedColumnId(column.id)}
                onDoubleClick={() => setDialog("rebar")}
              >
                Cột: {column.name} ({column.shape}-Sl:{column.quantity})
              </button>
            ))}
          </div>
          <div className="reorder">
            <button type="button" onClick={() => moveColumn("top")}>Top</button>
            <button type="button" onClick={() => moveColumn("up")}>
              <ArrowUp size={14} /> Up
            </button>
            <button type="button" onClick={() => moveColumn("down")}>
              <ArrowDown size={14} /> Down
            </button>
            <button type="button" onClick={() => moveColumn("bottom")}>Bottom</button>
          </div>
        </div>
      </aside>

      <main className="workspace">
        {error ? <div className="banner error">{error}</div> : null}
        {status ? <div className="banner">{status}</div> : null}

        <section className="elevation-board">
          {project.floors
            .slice()
            .reverse()
            .map((floor) => (
              <div key={floor.id} className="floor-band">
                <button
                  type="button"
                  className={floor.id === selectedFloorId ? "floor-meta active" : "floor-meta"}
                  onClick={() => {
                    setSelectedFloorId(floor.id);
                    setDialog("floorEdit");
                  }}
                >
                  <h3>Tầng {floor.name}</h3>
                  <span>Cao độ</span>
                  <strong>{elevations[floor.id].toFixed(2)}m</strong>
                  <span>H (mm)</span>
                  <strong>{floor.heightMm}</strong>
                </button>
                <div className="column-band-grid">
                  {project.columns.map((column) => {
                    const section = sectionFor(column, floor.id);
                    const active = column.id === selectedColumnId && floor.id === selectedFloorId;
                    return (
                      <button
                        key={`${floor.id}-${column.id}`}
                        type="button"
                        className={active ? "column-band-card active" : "column-band-card"}
                        onClick={() => {
                          setSelectedColumnId(column.id);
                          setSelectedFloorId(floor.id);
                          setDialog("rebar");
                        }}
                      >
                        <span className="dim-label">T</span>
                        <span className="dimension">
                          {section.cx}x{section.cy}
                        </span>
                        <span className="dim-label">KT</span>
                        <span className="annotation">Thép {formatBarLabel(section)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
        </section>

        <footer className="statusbar">
          <span>
            Tổng: {project.floors.length} tầng / {project.columns.length} cột
          </span>
          <div className="legend">
            {project.columns.map((column) => (
              <em key={column.id}>Cột {column.name}</em>
            ))}
          </div>
        </footer>

        {pdfUrl ? (
          <section className="pdf-box">
            <div className="topbar">
              <h2>Preview output.pdf</h2>
              <a className="primary-button" href={pdfUrl} download="output.pdf">
                Tải lại output.pdf
              </a>
            </div>
            <iframe title="PDF preview" src={pdfUrl} />
          </section>
        ) : null}
      </main>

      {dialog === "floors" ? (
        <Modal title="Thiết lập tầng" onClose={() => setDialog("none")}>
          <div className="form-row">
            <label>Nhập số tầng:</label>
            <input type="number" min={1} value={draftFloorCount} onChange={(e) => setDraftFloorCount(Number(e.target.value))} />
          </div>
          <div className="form-row">
            <label>Nhập chiều cao tầng (mm):</label>
            <input type="number" value={draftFloorHeight} onChange={(e) => setDraftFloorHeight(Number(e.target.value))} />
          </div>
          <div className="form-row">
            <label>Nhập chiều cao Dầm (mm):</label>
            <input type="number" value={draftBeamHeight} onChange={(e) => setDraftBeamHeight(Number(e.target.value))} />
          </div>
          <div className="button-row">
            <button type="button" className="ghost-button" onClick={() => setDialog("floorEdit")}>
              <Pencil size={16} /> Sửa tầng
            </button>
            <button type="button" className="success-button" onClick={applyFloorTemplate}>
              <Check size={16} /> Xong
            </button>
          </div>
        </Modal>
      ) : null}

      {dialog === "floorEdit" ? (
        <Modal title="Sửa tầng" onClose={() => setDialog("none")} wide>
          <div className="split">
            <div>
              <div className="form-row">
                <label>Tên tầng:</label>
                <input
                  value={selectedFloor.name}
                  onChange={(e) =>
                    persist({
                      ...project,
                      floors: project.floors.map((floor) =>
                        floor.id === selectedFloor.id ? { ...floor, name: e.target.value } : floor,
                      ),
                    })
                  }
                />
              </div>
              <div className="form-row">
                <label>Chiều cao tầng (mm):</label>
                <div className="inline-pair">
                  <input
                    type="number"
                    value={selectedFloor.heightMm}
                    onChange={(e) =>
                      persist({
                        ...project,
                        floors: project.floors.map((floor) =>
                          floor.id === selectedFloor.id ? { ...floor, heightMm: Number(e.target.value) } : floor,
                        ),
                      })
                    }
                  />
                  <button type="button" className="icon-action" onClick={() => setStatus("Đã cập nhật chiều cao tầng.")}>
                    <Play size={16} />
                  </button>
                </div>
              </div>
              <div className="form-row">
                <label>Cao độ (m):</label>
                <input readOnly value={elevations[selectedFloor.id].toFixed(2)} />
              </div>
              <div className="form-row">
                <label>Chiều cao dầm (mm):</label>
                <div className="inline-pair">
                  <input
                    type="number"
                    value={selectedFloor.beamHeightMm}
                    onChange={(e) =>
                      persist({
                        ...project,
                        floors: project.floors.map((floor) =>
                          floor.id === selectedFloor.id ? { ...floor, beamHeightMm: Number(e.target.value) } : floor,
                        ),
                      })
                    }
                  />
                  <button type="button" className="icon-action">
                    <Play size={16} />
                  </button>
                </div>
              </div>
              <div className="button-row">
                <button type="button" className="ghost-button" onClick={() => setDialog("floors")}>
                  <Pencil size={16} /> Sửa
                </button>
                <button type="button" className="success-button" onClick={() => setDialog("none")}>
                  <Check size={16} /> Xong
                </button>
              </div>
            </div>
            <div className="table-like">
              <div className="table-head table-five">
                <span>STT</span>
                <span>Tên</span>
                <span>H</span>
                <span>Cao</span>
                <span>H Dầm</span>
              </div>
              {project.floors.map((floor) => (
                <button
                  key={floor.id}
                  type="button"
                  className={floor.id === selectedFloorId ? "table-row table-five active" : "table-row table-five"}
                  onClick={() => setSelectedFloorId(floor.id)}
                >
                  <span>{floor.id}</span>
                  <span>{floor.name}</span>
                  <span>{floor.heightMm}</span>
                  <span>{elevations[floor.id].toFixed(2)}</span>
                  <span>{floor.beamHeightMm}</span>
                </button>
              ))}
            </div>
          </div>
        </Modal>
      ) : null}

      {dialog === "column" ? (
        <Modal title="Thiết lập cột" onClose={() => setDialog("none")} wide>
          <div className="split">
            <div>
              <div className="form-row">
                <label>Tên cột:</label>
                <input
                  value={selectedColumn.name}
                  onChange={(e) => patchColumn({ name: e.target.value, id: selectedColumn.id })}
                />
              </div>
              <div className="form-row">
                <label>Số lượng cột:</label>
                <input
                  type="number"
                  min={1}
                  value={selectedColumn.quantity}
                  onChange={(e) => patchColumn({ quantity: Number(e.target.value) || 1 })}
                />
              </div>
              <div className="form-row">
                <label>Bắt đầu từ tầng:</label>
                <select
                  value={selectedColumn.startFloor}
                  onChange={(e) => patchColumn({ startFloor: Number(e.target.value) })}
                >
                  {project.floors.map((floor) => (
                    <option key={floor.id} value={floor.id}>
                      {floor.id}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <label>Đến tầng:</label>
                <select
                  value={selectedColumn.endFloor}
                  onChange={(e) => patchColumn({ endFloor: Number(e.target.value) })}
                >
                  {project.floors.map((floor) => (
                    <option key={floor.id} value={floor.id}>
                      {floor.id}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <label>Rộng cạnh Cx (mm):</label>
                <div className="inline-pair">
                  <input
                    type="number"
                    value={selectedSection.cx}
                    onChange={(e) => patchSection({ cx: Number(e.target.value) }, true)}
                  />
                  <span />
                </div>
              </div>
              <div className="form-row">
                <label>Rộng cạnh Cy (mm):</label>
                <div className="inline-pair">
                  <input
                    type="number"
                    value={selectedSection.cy}
                    onChange={(e) => patchSection({ cy: Number(e.target.value) }, true)}
                  />
                  <button type="button" className="icon-action" onClick={() => setDialog("rebar")}>
                    <Play size={16} />
                  </button>
                </div>
              </div>
              <div className="shape-switch">
                <button
                  type="button"
                  className={selectedColumn.shape === "HCN" ? "shape-option active" : "shape-option"}
                  onClick={() => patchColumn({ shape: "HCN" })}
                >
                  Cột HCN
                </button>
                <button
                  type="button"
                  className={selectedColumn.shape === "TRON" ? "shape-option active" : "shape-option"}
                  onClick={() => patchColumn({ shape: "TRON" })}
                >
                  Cột tròn
                </button>
              </div>
            </div>
            <div className="table-like">
              <div className="table-head table-four">
                <span>STT</span>
                <span>Tầng</span>
                <span>Cạnh Cx (mm)</span>
                <span>Cạnh Cy (mm)</span>
              </div>
              {columnFloors(selectedColumn, project.floors).map((floor, index) => {
                const section = sectionFor(selectedColumn, floor.id);
                return (
                  <button
                    key={floor.id}
                    type="button"
                    className={floor.id === selectedFloorId ? "table-row table-four active" : "table-row table-four"}
                    onClick={() => setSelectedFloorId(floor.id)}
                  >
                    <span>{index + 1}</span>
                    <span>Tầng {floor.name}</span>
                    <span>{section.cx}</span>
                    <span>{section.cy}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </Modal>
      ) : null}

      {dialog === "rebar" ? (
        <Modal title="Bố trí thép cột" onClose={() => setDialog("none")} wide>
          <div className="status-strip">
            <span>
              Tầng: <strong className="green">{selectedFloor.name}</strong>
            </span>
            <span>
              Cột: <strong className="yellow">{selectedColumn.name}</strong>
            </span>
            <span>
              Hình dạng: <strong className="red">{selectedColumn.shape}</strong>
            </span>
          </div>
          <div className="reinforcement-layout">
            <div>
              <fieldset>
                <legend>Thép cột chính</legend>
                <div className="form-row">
                  <label>Số lượng thanh thép cạnh Cx:</label>
                  <select
                    value={selectedSection.barsX}
                    onChange={(e) => patchSection({ barsX: Number(e.target.value) }, applyUpper)}
                  >
                    {[2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <label>Số lượng thanh thép cạnh Cy:</label>
                  <select
                    value={selectedSection.barsY}
                    onChange={(e) => patchSection({ barsY: Number(e.target.value) }, applyUpper)}
                  >
                    {[2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <label>Đường kính cốt thép chính:</label>
                  <select
                    value={selectedSection.mainDia}
                    onChange={(e) => patchSection({ mainDia: Number(e.target.value) }, applyUpper)}
                  >
                    {DIAMETERS.filter((d) => d >= 10).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <label>Đường kính thép đai:</label>
                  <select
                    value={selectedSection.tieDia}
                    onChange={(e) => patchSection({ tieDia: Number(e.target.value) }, applyUpper)}
                  >
                    {[6, 8, 10].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              </fieldset>
              <fieldset>
                <legend>Có thép bổ sung</legend>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={selectedSection.extraSteel}
                    onChange={(e) => patchSection({ extraSteel: e.target.checked }, applyUpper)}
                  />
                  Có thép bổ sung
                </label>
                <div className={selectedSection.extraSteel ? "" : "disabled-block"}>
                  <div className="form-row">
                    <label>Đường kính thép bổ sung:</label>
                    <select
                      value={selectedSection.extraDia}
                      disabled={!selectedSection.extraSteel}
                      onChange={(e) => patchSection({ extraDia: Number(e.target.value) }, applyUpper)}
                    >
                      {DIAMETERS.filter((d) => d >= 10).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-row">
                    <label>Thép đai (bổ sung):</label>
                    <select
                      value={selectedSection.extraTieDia}
                      disabled={!selectedSection.extraSteel}
                      onChange={(e) => patchSection({ extraTieDia: Number(e.target.value) }, applyUpper)}
                    >
                      {[6, 8, 10].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-row">
                    <label>Số đai phụ X:</label>
                    <input
                      type="number"
                      disabled={!selectedSection.extraSteel}
                      value={selectedSection.extraTieX}
                      onChange={(e) => patchSection({ extraTieX: Number(e.target.value) || 0 }, applyUpper)}
                    />
                  </div>
                  <div className="form-row">
                    <label>Số đai phụ Y:</label>
                    <input
                      type="number"
                      disabled={!selectedSection.extraSteel}
                      value={selectedSection.extraTieY}
                      onChange={(e) => patchSection({ extraTieY: Number(e.target.value) || 0 }, applyUpper)}
                    />
                  </div>
                </div>
              </fieldset>
            </div>
            <div className="preview-panel">
              <ColumnPreview section={selectedSection} shape={selectedColumn.shape} />
            </div>
          </div>
          <div className="metrics">
            <p>Tiết diện cột sử dụng: {formatBarLabel(selectedSection)}</p>
            <p>Diện tích cốt thép (cm2): {steel.toFixed(2)}</p>
            <p>Hàm lượng cốt thép: {ratio.toFixed(2)} %</p>
          </div>
          <label className="checkbox-row highlight">
            <input
              type="checkbox"
              checked={applyUpper}
              onChange={(e) => {
                setApplyUpper(e.target.checked);
                if (e.target.checked) patchSection({}, true);
              }}
            />
            Sử dụng cốt thép đã bố trí cho các tầng trên
          </label>
          <div className="button-row align-end">
            <button
              type="button"
              className="success-button"
              onClick={() => {
                setDialog("none");
                void exportPdf();
              }}
            >
              <Check size={16} /> Xong
            </button>
            <button type="button" className="ghost-button" onClick={() => setDialog("none")}>
              <X size={16} /> Đóng
            </button>
          </div>
        </Modal>
      ) : null}
      </div>
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
  wide,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={wide ? "modal wide" : "modal"} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-action" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function ColumnPreview({ section, shape }: { section: FloorSection; shape: Column["shape"] }) {
  const width = 360;
  const height = 420;
  const margin = 48;
  const innerW = width - margin * 2;
  const innerH = height - margin * 2;
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < section.barsX; i += 1) {
    const t = section.barsX === 1 ? 0.5 : i / (section.barsX - 1);
    const x = margin + 18 + t * (innerW - 36);
    points.push({ x, y: margin + 18 }, { x, y: height - margin - 18 });
  }
  for (let i = 1; i < section.barsY - 1; i += 1) {
    const t = i / (section.barsY - 1);
    const y = margin + 18 + t * (innerH - 36);
    points.push({ x: margin + 18, y }, { x: width - margin - 18, y });
  }
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="column-preview" role="img" aria-label="Mặt cắt cột">
      {shape === "TRON" ? (
        <>
          <circle cx={width / 2} cy={height / 2} r={innerW / 2} fill="none" stroke="#f5f5f5" strokeWidth="3" />
          <circle cx={width / 2} cy={height / 2} r={innerW / 2 - 28} fill="none" stroke="#b0db34" strokeWidth="6" />
        </>
      ) : (
        <>
          <rect x={margin} y={margin} width={innerW} height={innerH} fill="none" stroke="#f5f5f5" strokeWidth="3" />
          <rect
            x={margin + 24}
            y={margin + 24}
            width={innerW - 48}
            height={innerH - 48}
            rx="16"
            fill="none"
            stroke="#b0db34"
            strokeWidth="6"
          />
        </>
      )}
      {points.map((point, index) => (
        <circle key={`${point.x}-${point.y}-${index}`} cx={point.x} cy={point.y} r="14" fill="#ff2f2f" />
      ))}
    </svg>
  );
}
