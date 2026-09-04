import { Check, Library, Search, Settings2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { SkillMetadata, SkillReference, SkillSource } from "../../shared/types";
import { SKILL_SOURCE_LABELS, skillDisplayName } from "../../shared/skills";

export function SkillPicker({
  skills,
  selected,
  errorCount,
  onChange,
  onOpenLibrary,
}: {
  skills: SkillMetadata[];
  selected: SkillReference[];
  errorCount: number;
  onChange: (skills: SkillReference[]) => void;
  onOpenLibrary: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<"all" | SkillSource>("all");
  const selectedPaths = useMemo(() => new Set(selected.map((item) => item.path)), [selected]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return skills
      .filter((skill) => skill.enabled)
      .filter((skill) => source === "all" || skill.source === source)
      .filter((skill) => !needle || `${skillDisplayName(skill)} ${skill.name} ${skill.description}`.toLowerCase().includes(needle))
      .slice(0, 80);
  }, [query, skills, source]);

  function toggle(skill: SkillMetadata) {
    if (selectedPaths.has(skill.path)) onChange(selected.filter((item) => item.path !== skill.path));
    else onChange([...selected, { name: skill.name, path: skill.path, displayName: skillDisplayName(skill) }]);
  }

  return <div className="skill-picker">
    <button className={selected.length ? "skill-picker__trigger active" : "skill-picker__trigger"} onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label="选择 Skills">
      <Library size={14} />Skills{selected.length > 0 && <em>{selected.length}</em>}
    </button>
    {open && <div className="skill-picker__popover" role="dialog" aria-label="为当前任务选择 Skills">
      <header><strong>任务 Skills</strong><small>由 Codex Agent Runtime 按需调用</small></header>
      <div className="skill-picker__search"><Search size={13} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称或能力" /></div>
      <div className="skill-picker__sources">
        <button className={source === "all" ? "active" : ""} onClick={() => setSource("all")}>全部</button>
        {(["repo", "user", "plugin", "system", "admin"] as SkillSource[]).map((value) => <button className={source === value ? "active" : ""} onClick={() => setSource(value)} key={value}>{SKILL_SOURCE_LABELS[value]}</button>)}
      </div>
      <div className="skill-picker__list">
        {visible.map((skill) => <button className={selectedPaths.has(skill.path) ? "selected" : ""} onClick={() => toggle(skill)} key={skill.path}>
          <span><strong>{skillDisplayName(skill)}</strong><small>{skill.interface?.shortDescription || skill.shortDescription || skill.description || skill.name}</small></span>
          <em>{SKILL_SOURCE_LABELS[skill.source]}</em>{selectedPaths.has(skill.path) && <Check size={13} />}
        </button>)}
        {!visible.length && <div className="skill-picker__empty">{skills.length ? "没有匹配的已启用 Skill" : "当前工作区尚未发现 Skill"}</div>}
      </div>
      <footer><span>{skills.filter((skill) => skill.enabled).length} 个可用{errorCount ? ` · ${errorCount} 个加载问题` : ""}</span><button onClick={() => { setOpen(false); onOpenLibrary(); }}><Settings2 size={12} />管理 Skills</button></footer>
    </div>}
  </div>;
}
