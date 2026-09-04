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
  alignedClosedTie,
  barAreaCm2,
  barCount,
  canUseTieC,
  canUseTieNested,
  doubleAlongX,
  doubleAlongY,
  doubleMinWrap,
  cTieAlongX,
  cTieAlongY,
  columnFloors,
  floorElevations,
  formatBarLabel,
  hasMainStirrup,
  lapMm,
  midSplicePosMm,
  edgeBarCenters,
  faceClearance,
  nestedAlongX,
  nestedAlongY,
  nestedMinWrap,
  nestedTieRect,
  normalizeColumn,
  sectionFor,
  steelRatioPercent,
} from "./lib/calc";
import { createSampleProject, emptySection } from "./lib/sample";
import { BAR_COUNT_MAX, BAR_COUNT_MIN, BAR_DIAMETERS, clampBarCount, clampMainDia, clampTieDia, MIN_BAR_CLEAR_MM, SPLICE_FACTORS, STIRRUP_HOOK_MM, type Column, type Floor, type FloorSection, type Project, type SpliceFactor, type TieOption } from "./lib/types";
import "./App.css";

const STORE_KEY = "thep-cot-project-v1";
const COLUMN_ACCENTS = ["#fff12d", "#73ff31", "#79b8ff", "#ff8c42", "#e879f9", "#ff6b6b"];

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
          loaded.columns = loaded.columns.map(normalizeColumn);
          setProject(loaded);
          setSelectedColumnId(loaded.columns[loaded.columns.length - 1]?.id ?? "C1");
        }
      }
    } catch {
      /* keep sample */
    }
  }, []);

  const selectedColumn = useMemo(
    () => normalizeColumn(project.columns.find((column) => column.id === selectedColumnId) ?? project.columns[0]),
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
      baseSplice: true,
      baseSpliceD: 30,
      midSplice: false,
      midSpliceD: 35,
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
            <div className="brand-sub">Nhập tầng, tiết diện cột và thép, bấm Xuất PDF: mỗi loại cột một trang A1 (cao độ · mặt đứng cổ chai · mặt cắt), thống kê bên phải.</div>
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
                  {project.columns.map((column, columnIndex) => {
                    const section = sectionFor(column, floor.id);
                    const active = column.id === selectedColumnId && floor.id === selectedFloorId;
                    const accent = COLUMN_ACCENTS[columnIndex % COLUMN_ACCENTS.length];
                    return (
                      <button
                        key={`${floor.id}-${column.id}`}
                        type="button"
                        className={active ? "column-band-card active" : "column-band-card"}
                        style={{ borderLeftColor: accent }}
                        onClick={() => {
                          setSelectedColumnId(column.id);
                          setSelectedFloorId(floor.id);
                          setDialog("rebar");
                        }}
                      >
                        <span className="column-name" style={{ color: accent }}>
                          Cột {column.name}
                        </span>
                        <span className="column-meta">
                          {column.shape} · SL {column.quantity}
                        </span>
                        <span className="dimension">
                          {section.cx}×{section.cy}
                        </span>
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
        </footer>
      </main>

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
              <fieldset>
                <legend>Nối thép cột</legend>
                <p className="splice-hint">
                  Chân cột (+0.000): thép đi thẳng, không bẻ cổ chai. Cổ chai chỉ vẽ bên ngoài thân cột, tại đỉnh sắt tầng dưới; chọn nối giữa cột thì mới hiện ở giữa tầng 1.
                </p>
                <p className="splice-hint">
                  Giữa cột: vị trí (H tầng − H dầm) / 2; 50% thép chủ tại đó, 50% lệch thêm nD.
                </p>
                <p className="splice-hint">Chỉ chọn một: chân cột hoặc giữa cột.</p>
                <div className="form-row">
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={selectedColumn.baseSplice}
                      onChange={(e) =>
                        patchColumn(
                          e.target.checked
                            ? { baseSplice: true, midSplice: false }
                            : { baseSplice: false },
                        )
                      }
                    />
                    Nối so le tại chân cột
                  </label>
                  <select
                    value={selectedColumn.baseSpliceD}
                    disabled={!selectedColumn.baseSplice}
                    onChange={(e) => patchColumn({ baseSpliceD: Number(e.target.value) as SpliceFactor })}
                  >
                    {SPLICE_FACTORS.map((n) => (
                      <option key={n} value={n}>
                        {n}D
                      </option>
                    ))}
                  </select>
                </div>
                {selectedColumn.baseSplice ? (
                  <p className="splice-hint">
                    50% = {selectedColumn.baseSpliceD}D ({lapMm(selectedSection.mainDia, selectedColumn.baseSpliceD)} mm),
                    50% = {2 * selectedColumn.baseSpliceD}D ({2 * lapMm(selectedSection.mainDia, selectedColumn.baseSpliceD)} mm) theo Ø{selectedSection.mainDia}.
                  </p>
                ) : null}
                <div className="form-row">
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={selectedColumn.midSplice}
                      onChange={(e) =>
                        patchColumn(
                          e.target.checked
                            ? { midSplice: true, baseSplice: false }
                            : { midSplice: false },
                        )
                      }
                    />
                    Nối so le tại giữa cột
                  </label>
                  <select
                    value={selectedColumn.midSpliceD}
                    disabled={!selectedColumn.midSplice}
                    onChange={(e) => patchColumn({ midSpliceD: Number(e.target.value) as SpliceFactor })}
                  >
                    {SPLICE_FACTORS.map((n) => (
                      <option key={n} value={n}>
                        {n}D
                      </option>
                    ))}
                  </select>
                </div>
                {selectedColumn.midSplice ? (
                  <p className="splice-hint">
                    Tầng {selectedFloor.name}: 50% tại {Math.round(midSplicePosMm(selectedFloor))} mm, 50% tại{" "}
                    {Math.round(midSplicePosMm(selectedFloor) + lapMm(selectedSection.mainDia, selectedColumn.midSpliceD))} mm
                    ({Math.round(midSplicePosMm(selectedFloor))} + {selectedColumn.midSpliceD}D).
                  </p>
                ) : null}
              </fieldset>
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
                  <input
                    type="number"
                    min={BAR_COUNT_MIN}
                    max={BAR_COUNT_MAX}
                    value={selectedSection.barsX}
                    onChange={(e) => {
                      const barsX = Math.min(BAR_COUNT_MAX, Math.max(0, Math.round(Number(e.target.value)) || 0));
                      const evenBoth = barsX % 2 === 0 && selectedSection.barsY % 2 === 0;
                      const nestOk = barsX >= 4 || selectedSection.barsY >= 4;
                      patchSection(
                        {
                          barsX,
                          tieC: {
                            ...selectedSection.tieC,
                            enabled: evenBoth ? false : selectedSection.tieC.enabled,
                            alongX: barsX % 2 === 1 ? selectedSection.tieC.alongX !== false : false,
                            alongY: selectedSection.barsY % 2 === 1 ? selectedSection.tieC.alongY !== false : false,
                          },
                          tieNested: {
                            ...selectedSection.tieNested,
                            enabled: nestOk ? selectedSection.tieNested.enabled : false,
                            alongX: barsX >= 4 ? (selectedSection.barsX >= 4 ? selectedSection.tieNested.alongX : true) : false,
                            alongY: selectedSection.barsY >= 4 ? selectedSection.tieNested.alongY : false,
                            wrapBarsX: nestedMinWrap(barsX),
                            wrapBarsY: nestedMinWrap(selectedSection.barsY),
                          },
                          tieDouble: {
                            ...selectedSection.tieDouble,
                            enabled: nestOk ? selectedSection.tieDouble.enabled : false,
                            alongX: barsX >= 4 ? (selectedSection.barsX >= 4 ? selectedSection.tieDouble.alongX : true) : false,
                            alongY: selectedSection.barsY >= 4 ? selectedSection.tieDouble.alongY : false,
                            wrapBarsX: doubleMinWrap(barsX),
                            wrapBarsY: doubleMinWrap(selectedSection.barsY),
                          },
                        },
                        applyUpper,
                      );
                    }}
                    onBlur={() => {
                      const barsX = clampBarCount(selectedSection.barsX);
                      if (barsX === selectedSection.barsX) return;
                      patchSection(
                        {
                          barsX,
                          tieNested: {
                            ...selectedSection.tieNested,
                            wrapBarsX: nestedMinWrap(barsX),
                          },
                          tieDouble: {
                            ...selectedSection.tieDouble,
                            wrapBarsX: doubleMinWrap(barsX),
                          },
                        },
                        applyUpper,
                      );
                    }}
                  />
                </div>
                <FaceClearanceNote section={selectedSection} axis="x" />
                <div className="form-row">
                  <label>Số lượng thanh thép cạnh Cy:</label>
                  <input
                    type="number"
                    min={BAR_COUNT_MIN}
                    max={BAR_COUNT_MAX}
                    value={selectedSection.barsY}
                    onChange={(e) => {
                      const barsY = Math.min(BAR_COUNT_MAX, Math.max(0, Math.round(Number(e.target.value)) || 0));
                      const evenBoth = selectedSection.barsX % 2 === 0 && barsY % 2 === 0;
                      const nestOk = selectedSection.barsX >= 4 || barsY >= 4;
                      patchSection(
                        {
                          barsY,
                          tieC: {
                            ...selectedSection.tieC,
                            enabled: evenBoth ? false : selectedSection.tieC.enabled,
                            alongX: selectedSection.barsX % 2 === 1 ? selectedSection.tieC.alongX !== false : false,
                            alongY: barsY % 2 === 1 ? selectedSection.tieC.alongY !== false : false,
                          },
                          tieNested: {
                            ...selectedSection.tieNested,
                            enabled: nestOk ? selectedSection.tieNested.enabled : false,
                            alongX: selectedSection.barsX >= 4 ? selectedSection.tieNested.alongX : false,
                            alongY: barsY >= 4 ? (selectedSection.barsY >= 4 ? selectedSection.tieNested.alongY : true) : false,
                            wrapBarsX: nestedMinWrap(selectedSection.barsX),
                            wrapBarsY: nestedMinWrap(barsY),
                          },
                          tieDouble: {
                            ...selectedSection.tieDouble,
                            enabled: nestOk ? selectedSection.tieDouble.enabled : false,
                            alongX: selectedSection.barsX >= 4 ? selectedSection.tieDouble.alongX : false,
                            alongY: barsY >= 4 ? (selectedSection.barsY >= 4 ? selectedSection.tieDouble.alongY : true) : false,
                            wrapBarsX: doubleMinWrap(selectedSection.barsX),
                            wrapBarsY: doubleMinWrap(barsY),
                          },
                        },
                        applyUpper,
                      );
                    }}
                    onBlur={() => {
                      const barsY = clampBarCount(selectedSection.barsY);
                      if (barsY === selectedSection.barsY) return;
                      patchSection(
                        {
                          barsY,
                          tieNested: { ...selectedSection.tieNested, wrapBarsY: nestedMinWrap(barsY) },
                          tieDouble: { ...selectedSection.tieDouble, wrapBarsY: doubleMinWrap(barsY) },
                        },
                        applyUpper,
                      );
                    }}
                  />
                </div>
                <FaceClearanceNote section={selectedSection} axis="y" />
                <div className="form-row">
                  <label>Đường kính cốt thép chính:</label>
                  <select
                    value={selectedSection.mainDia}
                    onChange={(e) => patchSection({ mainDia: clampMainDia(Number(e.target.value)) }, applyUpper)}
                  >
                    {BAR_DIAMETERS.map((n) => (
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
                    onChange={(e) => patchSection({ tieDia: clampTieDia(Number(e.target.value)) }, applyUpper)}
                  >
                    {BAR_DIAMETERS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              </fieldset>
              <fieldset>
                <legend>Đai bổ sung</legend>
                <TieOptionFields
                  title="Đai C"
                  variant="c"
                  section={selectedSection}
                  value={selectedSection.tieC}
                  onChange={(partial) =>
                    patchSection({ tieC: { ...selectedSection.tieC, ...partial } }, applyUpper)
                  }
                />
                <TieOptionFields
                  title="Đai lồng"
                  variant="nested"
                  kind="nested"
                  section={selectedSection}
                  blocked={selectedSection.tieDouble.enabled}
                  blockedHint="Đã chọn đai kép — không dùng đai lồng."
                  value={selectedSection.tieNested}
                  onChange={(partial) =>
                    patchSection(
                      {
                        tieNested: { ...selectedSection.tieNested, ...partial },
                        ...(partial.enabled ? { tieDouble: { ...selectedSection.tieDouble, enabled: false } } : {}),
                      },
                      applyUpper,
                    )
                  }
                />
                <TieOptionFields
                  title="Đai kép"
                  variant="nested"
                  kind="double"
                  section={selectedSection}
                  blocked={selectedSection.tieNested.enabled}
                  blockedHint="Đã chọn đai lồng — không dùng đai kép."
                  value={selectedSection.tieDouble}
                  onChange={(partial) =>
                    patchSection(
                      {
                        tieDouble: { ...selectedSection.tieDouble, ...partial },
                        ...(partial.enabled ? { tieNested: { ...selectedSection.tieNested, enabled: false } } : {}),
                      },
                      applyUpper,
                    )
                  }
                />
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

function TieOptionFields({
  title,
  value,
  onChange,
  variant = "box",
  kind = "nested",
  section,
  blocked = false,
  blockedHint,
}: {
  title: string;
  value: TieOption;
  onChange: (partial: Partial<TieOption>) => void;
  variant?: "c" | "nested" | "box";
  kind?: "nested" | "double";
  section?: FloorSection;
  blocked?: boolean;
  blockedHint?: string;
}) {
  const allowC = variant !== "c" || (section ? canUseTieC(section) : false);
  const allowNested = variant !== "nested" || (section ? canUseTieNested(section) : false);
  const allow = allowC && allowNested && !blocked;
  const aligned = section && variant === "box" ? alignedClosedTie(section, value, kind) : null;
  const axes = variant === "c" || variant === "nested";
  const xOk = section ? (variant === "c" ? section.barsX % 2 === 1 : section.barsX >= 4) : false;
  const yOk = section ? (variant === "c" ? section.barsY % 2 === 1 : section.barsY >= 4) : false;

  return (
    <div className="tie-option">
      <label className={allow ? "checkbox-row" : "checkbox-row disabled"}>
        <input
          type="checkbox"
          checked={value.enabled && allow}
          disabled={!allow}
          onChange={(e) => {
            if (!allow) return;
            if (!e.target.checked) {
              onChange({ enabled: false });
              return;
            }
            if (variant === "box" && section) {
              const next = alignedClosedTie(section, { ...value, enabled: true }, kind);
              onChange({ enabled: true, xMm: next.xMm, yMm: next.yMm });
              return;
            }
            if (variant === "c" && section) {
              onChange({
                enabled: true,
                alongX: section.barsX % 2 === 1,
                alongY: section.barsY % 2 === 1,
                spacingMm: value.spacingMm || 200,
              });
              return;
            }
            if (variant === "nested" && section) {
              const wrapX = kind === "double" ? doubleMinWrap(section.barsX) : nestedMinWrap(section.barsX);
              const wrapY = kind === "double" ? doubleMinWrap(section.barsY) : nestedMinWrap(section.barsY);
              onChange({
                enabled: true,
                alongX: section.barsX >= 4,
                alongY: section.barsY >= 4,
                spacingMm: value.spacingMm || 200,
                wrapBarsX: wrapX,
                wrapBarsY: wrapY,
              });
              return;
            }
            onChange({ enabled: true });
          }}
        />
        {title}
      </label>
      {blocked && blockedHint ? <p className="splice-hint">{blockedHint}</p> : null}
      {value.enabled && allow && kind === "double" ? (
        <p className="splice-hint">Đai kép thay đai đơn — không vẽ và không thống kê đai đơn.</p>
      ) : null}
      {value.enabled && allow && axes && section ? (
        <div className="tie-c-fields">
          <div className="form-row">
            <label>Khoảng cách (mm):</label>
            <input
              type="number"
              min={0}
              value={value.spacingMm || 200}
              onChange={(e) => onChange({ spacingMm: Number(e.target.value) || 200 })}
            />
          </div>
          <label className={xOk ? "checkbox-row nested" : "checkbox-row nested disabled"}>
            <input
              type="checkbox"
              checked={Boolean(value.alongX) && xOk}
              disabled={!xOk}
              onChange={(e) => onChange({ alongX: e.target.checked })}
            />
            Bố trí theo phương Cx
          </label>
          {variant === "nested" && value.alongX && xOk ? (
            <NestedWrapNote section={section} axis="x" kind={kind} />
          ) : null}
          <label className={yOk ? "checkbox-row nested" : "checkbox-row nested disabled"}>
            <input
              type="checkbox"
              checked={Boolean(value.alongY) && yOk}
              disabled={!yOk}
              onChange={(e) => onChange({ alongY: e.target.checked })}
            />
            Bố trí theo phương Cy
          </label>
          {variant === "nested" && value.alongY && yOk ? (
            <NestedWrapNote section={section} axis="y" kind={kind} />
          ) : null}
        </div>
      ) : null}
      {value.enabled && variant === "box" && aligned ? (
        <div>
          {aligned.longAxis === "y" ? (
            <>
              <div className="form-row">
                <label>Cạnh ngắn X (mm):</label>
                <input
                  type="number"
                  min={0}
                  value={value.xMm || aligned.xMm}
                  onChange={(e) => onChange({ xMm: Number(e.target.value) || 0, yMm: aligned.yMm })}
                />
              </div>
              <div className="form-row">
                <label>Cạnh dài Y (đai đơn):</label>
                <input type="number" readOnly value={aligned.yMm} />
              </div>
            </>
          ) : (
            <>
              <div className="form-row">
                <label>Cạnh dài X (đai đơn):</label>
                <input type="number" readOnly value={aligned.xMm} />
              </div>
              <div className="form-row">
                <label>Cạnh ngắn Y (mm):</label>
                <input
                  type="number"
                  min={0}
                  value={value.yMm || aligned.yMm}
                  onChange={(e) => onChange({ yMm: Number(e.target.value) || 0, xMm: aligned.xMm })}
                />
              </div>
            </>
          )}
          <p className="splice-hint">
            Cạnh dài khớp đai đơn {aligned.longAxis === "y" ? aligned.yMm : aligned.xMm} mm
          </p>
          <div className="form-row">
            <label>Khoảng cách (mm):</label>
            <input
              type="number"
              min={0}
              value={value.spacingMm}
              onChange={(e) => onChange({ spacingMm: Number(e.target.value) || 0 })}
            />
          </div>
        </div>
      ) : null}
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

function formatMm(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function FaceClearanceNote({ section, axis }: { section: FloorSection; axis: "x" | "y" }) {
  const info = faceClearance(section, axis);
  return (
    <p className={info.ok ? "splice-hint" : "clearance-warn"}>
      Đai {info.name} {Math.round(info.span)} mm − {info.bars}Ø{info.dia} → khoảng hở {formatMm(info.gap)} mm
      {info.ok ? "" : ` (nhỏ hơn ${MIN_BAR_CLEAR_MM} mm)`}
    </p>
  );
}

function NestedWrapNote({
  section,
  axis,
  kind = "nested",
}: {
  section: FloorSection;
  axis: "x" | "y";
  kind?: "nested" | "double";
}) {
  const info = faceClearance(section, axis, kind);
  const frac = kind === "double" ? "2/3" : "1/3";
  const label = kind === "double" ? "đai kép" : "đai lồng";
  return (
    <div className="nested-wrap-note">
      <p className="splice-hint">
        Bo ngoài {info.wrap} sắt chủ ({frac} × {info.bars} cây) – {label}
        {kind === "double" ? ", ôm ngoài 2 thanh góc" : ""}
      </p>
      <p className="nested-wrap-mm">{info.nestedMm} mm</p>
      {!info.ok ? (
        <p className="clearance-warn">
          Khoảng hở {formatMm(info.gap)} mm nhỏ hơn {MIN_BAR_CLEAR_MM} mm — tăng {info.name} hoặc giảm số thanh / Ø.
        </p>
      ) : null}
    </div>
  );
}

function ExtraTiesPreview({
  section,
  originX,
  originY,
  innerW,
  innerH,
  stirrupOffset,
  barInset,
}: {
  section: FloorSection;
  originX: number;
  originY: number;
  innerW: number;
  innerH: number;
  stirrupOffset: number;
  barInset: number;
}) {
  const outerX = originX + stirrupOffset;
  const outerY = originY + stirrupOffset;
  const outerW = innerW - stirrupOffset * 2;
  const outerH = innerH - stirrupOffset * 2;
  const left = originX + barInset;
  const right = originX + innerW - barInset;
  const top = originY + barInset;
  const bottom = originY + innerH - barInset;
  const pad = barInset - stirrupOffset;
  const xs = edgeBarCenters(section.barsX, left, right - left);
  const ys = edgeBarCenters(section.barsY, top, bottom - top);
  const nodes: ReactNode[] = [];

  if (nestedAlongX(section) && !section.tieDouble.enabled) {
    const box = nestedTieRect(section.barsX, xs, pad, outerY, outerH, "x");
    nodes.push(
      <rect
        key="nested-x"
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
        rx="10"
        fill="none"
        stroke="#4dabf7"
        strokeWidth="5"
      />,
    );
  }
  if (nestedAlongY(section) && !section.tieDouble.enabled) {
    const box = nestedTieRect(section.barsY, ys, pad, outerX, outerW, "y");
    nodes.push(
      <rect
        key="nested-y"
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
        rx="10"
        fill="none"
        stroke="#74c0fc"
        strokeWidth="5"
      />,
    );
  }

  if (doubleAlongX(section) && !section.tieNested.enabled) {
    const wrap = doubleMinWrap(section.barsX);
    const leftBox = nestedTieRect(section.barsX, xs, pad, outerY, outerH, "x", wrap, "start");
    const rightBox = nestedTieRect(section.barsX, xs, pad, outerY, outerH, "x", wrap, "end");
    nodes.push(
      <rect key="double-x-a" x={leftBox.x} y={leftBox.y} width={leftBox.w} height={leftBox.h} rx="12" fill="none" stroke="#ff6b6b" strokeWidth="4" />,
      <rect key="double-x-b" x={rightBox.x} y={rightBox.y} width={rightBox.w} height={rightBox.h} rx="12" fill="none" stroke="#4dabf7" strokeWidth="4" />,
    );
  }
  if (doubleAlongY(section) && !section.tieNested.enabled) {
    const wrap = doubleMinWrap(section.barsY);
    const topBox = nestedTieRect(section.barsY, ys, pad, outerX, outerW, "y", wrap, "start");
    const botBox = nestedTieRect(section.barsY, ys, pad, outerX, outerW, "y", wrap, "end");
    nodes.push(
      <rect key="double-y-a" x={topBox.x} y={topBox.y} width={topBox.w} height={topBox.h} rx="12" fill="none" stroke="#ff6b6b" strokeWidth="4" />,
      <rect key="double-y-b" x={botBox.x} y={botBox.y} width={botBox.w} height={botBox.h} rx="12" fill="none" stroke="#74c0fc" strokeWidth="4" />,
    );
  }

  if (section.tieC.enabled) {
    const sx = section.cx > 0 ? innerW / section.cx : 1;
    const sy = section.cy > 0 ? innerH / section.cy : 1;
    const hook = Math.max(12, STIRRUP_HOOK_MM * Math.min(sx, sy) * 0.45);
    const ret = Math.max(8, hook * 0.5);
    const sLeft = outerX;
    const sRight = outerX + outerW;
    const sTop = outerY;
    const sBottom = outerY + outerH;
    if (cTieAlongX(section)) {
      const x = sLeft + outerW / 2;
      nodes.push(
        <path
          key="c-x"
          d={`M ${x + hook} ${sTop + ret} L ${x + hook} ${sTop} L ${x} ${sTop} L ${x} ${sBottom} L ${x + hook} ${sBottom} L ${x + hook} ${sBottom - ret}`}
          fill="none"
          stroke="#ffa94d"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />,
      );
    }
    if (cTieAlongY(section)) {
      const y = sTop + outerH / 2;
      nodes.push(
        <path
          key="c-y"
          d={`M ${sLeft + ret} ${y + hook} L ${sLeft} ${y + hook} L ${sLeft} ${y} L ${sRight} ${y} L ${sRight} ${y + hook} L ${sRight - ret} ${y + hook}`}
          fill="none"
          stroke="#ffa94d"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />,
      );
    }
  }

  return nodes.length ? <>{nodes}</> : null;
}

function PreviewDims({
  x,
  y,
  w,
  h,
  cx,
  cy,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}) {
  const gap = 22;
  const tick = 6;
  const cxY = y + h + gap;
  const cyX = x - gap;
  return (
    <g stroke="#fff12d" fill="#fff12d" strokeWidth="1.5">
      <line x1={x} y1={y + h} x2={x} y2={cxY} />
      <line x1={x + w} y1={y + h} x2={x + w} y2={cxY} />
      <line x1={x} y1={cxY} x2={x + w} y2={cxY} />
      <line x1={x} y1={cxY - tick} x2={x} y2={cxY + tick} />
      <line x1={x + w} y1={cxY - tick} x2={x + w} y2={cxY + tick} />
      <text x={x + w / 2} y={cxY + 18} textAnchor="middle" stroke="none" fontSize="15" fontWeight="700">
        Cx {cx}
      </text>
      <line x1={x} y1={y} x2={cyX} y2={y} />
      <line x1={x} y1={y + h} x2={cyX} y2={y + h} />
      <line x1={cyX} y1={y} x2={cyX} y2={y + h} />
      <line x1={cyX - tick} y1={y} x2={cyX + tick} y2={y} />
      <line x1={cyX - tick} y1={y + h} x2={cyX + tick} y2={y + h} />
      <text
        x={cyX - 12}
        y={y + h / 2}
        textAnchor="middle"
        stroke="none"
        fontSize="15"
        fontWeight="700"
        transform={`rotate(-90 ${cyX - 12} ${y + h / 2})`}
      >
        Cy {cy}
      </text>
    </g>
  );
}

function ColumnPreview({ section, shape }: { section: FloorSection; shape: Column["shape"] }) {
  const width = 400;
  const height = 480;
  const originX = 72;
  const originY = 28;
  const innerW = 300;
  const innerH = 390;
  const barR = Math.max(2.5, Math.min(14, 90 / Math.max(section.barsX, section.barsY, 2)));
  const stirrupStroke = 6;
  const stirrupOffset = 24;
  const cover = 5;
  const inset = stirrupOffset + stirrupStroke / 2 + barR + cover;
  const points: Array<{ x: number; y: number }> = [];

  if (shape === "TRON") {
    const cx = originX + innerW / 2;
    const cy = originY + innerH / 2;
    const stirrupR = Math.min(innerW, innerH) / 2 - 28;
    const ringR = Math.max(barR * 2, stirrupR - stirrupStroke / 2 - barR - cover);
    const n = Math.max(4, section.barsX * 2 + section.barsY * 2 - 4);
    for (let i = 0; i < n; i += 1) {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      points.push({ x: cx + ringR * Math.cos(angle), y: cy + ringR * Math.sin(angle) });
    }
  } else {
    const left = originX + inset;
    const right = originX + innerW - inset;
    const top = originY + inset;
    const bottom = originY + innerH - inset;
    const spanX = right - left;
    const spanY = bottom - top;
    for (let i = 0; i < section.barsX; i += 1) {
      const t = section.barsX === 1 ? 0.5 : i / (section.barsX - 1);
      const x = left + t * spanX;
      points.push({ x, y: top }, { x, y: bottom });
    }
    for (let i = 1; i < section.barsY - 1; i += 1) {
      const t = i / (section.barsY - 1);
      const y = top + t * spanY;
      points.push({ x: left, y }, { x: right, y });
    }
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="column-preview" role="img" aria-label="Mặt cắt cột">
      {shape === "TRON" ? (
        <>
          <circle cx={originX + innerW / 2} cy={originY + innerH / 2} r={Math.min(innerW, innerH) / 2} fill="none" stroke="#f5f5f5" strokeWidth="3" />
          {hasMainStirrup(section) ? (
            <circle
              cx={originX + innerW / 2}
              cy={originY + innerH / 2}
              r={Math.min(innerW, innerH) / 2 - 28}
              fill="none"
              stroke="#b0db34"
              strokeWidth={stirrupStroke}
            />
          ) : null}
          <PreviewDims x={originX} y={originY} w={innerW} h={innerH} cx={section.cx} cy={section.cy} />
        </>
      ) : (
        <>
          <rect x={originX} y={originY} width={innerW} height={innerH} fill="none" stroke="#f5f5f5" strokeWidth="3" />
          {hasMainStirrup(section) ? (
            <rect
              x={originX + stirrupOffset}
              y={originY + stirrupOffset}
              width={innerW - stirrupOffset * 2}
              height={innerH - stirrupOffset * 2}
              rx="16"
              fill="none"
              stroke="#b0db34"
              strokeWidth={stirrupStroke}
            />
          ) : null}
          <ExtraTiesPreview
            section={section}
            originX={originX}
            originY={originY}
            innerW={innerW}
            innerH={innerH}
            stirrupOffset={stirrupOffset}
            barInset={inset}
          />
          <PreviewDims x={originX} y={originY} w={innerW} h={innerH} cx={section.cx} cy={section.cy} />
        </>
      )}
      {points.map((point, index) => (
        <circle key={`${point.x}-${point.y}-${index}`} cx={point.x} cy={point.y} r={barR} fill="#ff2f2f" />
      ))}
    </svg>
  );
}
