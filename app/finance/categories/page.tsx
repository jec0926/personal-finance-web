"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Category = { id: string; parent_id: string | null; name: string; sort_order: number; is_active: boolean };

export default function CategoriesPage() {
  const [items, setItems] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/finance/categories", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error ?? "카테고리를 불러오지 못했습니다.");
    setItems(data.categories ?? []);
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => { load().catch((reason) => setError(reason.message)); }, 0); return () => window.clearTimeout(timer); }, [load]);
  const roots = useMemo(() => items.filter((item) => !item.parent_id), [items]);

  async function create() {
    if (!name.trim()) return;
    setSaving(true); setError(null);
    try {
      const response = await fetch("/api/finance/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, parentId: parentId || null, sortOrder: 100 }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error ?? "저장하지 못했습니다.");
      setName(""); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "오류가 발생했습니다."); } finally { setSaving(false); }
  }

  async function update(item: Category, changes: Partial<Category>) {
    const next = { ...item, ...changes };
    const response = await fetch("/api/finance/categories", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: next.id, name: next.name, sortOrder: next.sort_order, isActive: next.is_active }) });
    const data = await response.json();
    if (!response.ok || !data.success) { setError(data.error ?? "수정하지 못했습니다."); return; }
    await load();
  }

  return <main className="min-h-screen bg-gray-50 p-4 md:p-8"><div className="mx-auto max-w-5xl">
    <header><p className="text-sm font-medium text-gray-500">설정</p><h1 className="mt-1 text-3xl font-bold text-gray-900">카테고리</h1><p className="mt-2 text-sm text-gray-500">거래 분류에 사용할 대분류와 소분류를 관리합니다. 기존 거래의 문자열은 그대로 유지됩니다.</p></header>
    {error && <div className="mt-5 border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    <section className="mt-6 border border-gray-200 bg-white p-5"><h2 className="font-semibold">카테고리 추가</h2><div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
      <select value={parentId} onChange={(e) => setParentId(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2"><option value="">대분류로 추가</option>{roots.filter((root) => root.is_active).map((root) => <option key={root.id} value={root.id}>{root.name} 아래 소분류</option>)}</select>
      <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void create(); }} placeholder="카테고리 이름" className="rounded-lg border border-gray-300 px-3 py-2" />
      <button disabled={saving || !name.trim()} onClick={() => void create()} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">추가</button>
    </div></section>
    <section className="mt-5 overflow-hidden border border-gray-200 bg-white"><div className="border-b border-gray-200 px-5 py-4"><h2 className="font-semibold">분류 체계</h2></div>
      {roots.length === 0 ? <p className="p-10 text-center text-sm text-gray-500">아직 카테고리가 없습니다.</p> : roots.map((root) => <div key={root.id} className="border-b border-gray-100 last:border-0">
        <CategoryRow item={root} update={update} />
        <div className="bg-gray-50/70 pl-8">{items.filter((item) => item.parent_id === root.id).map((child) => <CategoryRow key={child.id} item={child} child update={update} />)}</div>
      </div>)}
    </section>
  </div></main>;
}

function CategoryRow({ item, child = false, update }: { item: Category; child?: boolean; update: (item: Category, changes: Partial<Category>) => Promise<void> }) {
  const [draft, setDraft] = useState(item.name);
  return <div className="flex flex-wrap items-center gap-3 px-5 py-3">
    <span className="w-5 text-gray-300">{child ? "└" : ""}</span><input value={draft} onChange={(e) => setDraft(e.target.value)} className={`min-w-0 flex-1 border-0 bg-transparent px-1 py-1 ${child ? "text-sm text-gray-700" : "font-semibold text-gray-900"}`} />
    <input aria-label="정렬순서" type="number" min="0" value={item.sort_order} onChange={(e) => void update(item, { sort_order: Number(e.target.value) })} className="w-20 rounded border border-gray-200 px-2 py-1 text-sm" />
    <button onClick={() => void update(item, { name: draft })} disabled={!draft.trim() || draft === item.name} className="text-sm font-medium text-gray-600 disabled:opacity-30">이름 저장</button>
    <button onClick={() => void update(item, { is_active: !item.is_active })} className={`rounded-full px-3 py-1 text-xs font-semibold ${item.is_active ? "bg-gray-900 text-white" : "bg-gray-200 text-gray-600"}`}>{item.is_active ? "사용 중" : "비활성"}</button>
  </div>;
}
