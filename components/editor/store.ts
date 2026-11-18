"use client";

import { nanoid } from "nanoid";
import { createContext, useContext } from "react";
import { createStore, useStore } from "zustand";
import { defaultTextStyle, slugifyKey, uniqueKey, type Field, type TextField } from "@/lib/fields/schema";

const HISTORY_LIMIT = 100;

export interface EditorState {
  templateWidth: number;
  templateHeight: number;
  fields: Field[];
  selectedId: string | null;
  past: Field[][];
  future: Field[][];
  /** Bumped on every change to `fields`; autosave compares it with the last saved revision. */
  revision: number;

  select(id: string | null): void;
  /** Records the current fields as an undo step. Call once before a gesture or edit. */
  checkpoint(): void;
  /** Changes a field without recording history (use during drags, after checkpoint()). */
  patchField(id: string, patch: Partial<Field> | ((field: Field) => Field)): void;
  /** checkpoint() + patchField(), for discrete edits from the panel. */
  updateField(id: string, patch: Partial<Field> | ((field: Field) => Field)): void;
  addField(box?: Partial<Field["box"]>): string;
  duplicateField(id: string): void;
  removeField(id: string): void;
  moveField(id: string, direction: -1 | 1): void;
  undo(): void;
  redo(): void;
}

export function createEditorStore(init: { width: number; height: number; fields: Field[] }) {
  return createStore<EditorState>()((set, get) => {
    const commit = (fields: Field[], extra: Partial<EditorState> = {}) =>
      set((s) => ({
        past: [...s.past, s.fields].slice(-HISTORY_LIMIT),
        future: [],
        fields,
        revision: s.revision + 1,
        ...extra,
      }));

    return {
      templateWidth: init.width,
      templateHeight: init.height,
      fields: init.fields,
      selectedId: null,
      past: [],
      future: [],
      revision: 0,

      select: (id) => set({ selectedId: id }),

      checkpoint: () => set((s) => ({ past: [...s.past, s.fields].slice(-HISTORY_LIMIT), future: [] })),

      patchField: (id, patch) =>
        set((s) => ({
          fields: s.fields.map((f) => (f.id === id ? (typeof patch === "function" ? patch(f) : ({ ...f, ...patch } as Field)) : f)),
          revision: s.revision + 1,
        })),

      updateField: (id, patch) => {
        get().checkpoint();
        get().patchField(id, patch);
      },

      addField: (box) => {
        const { templateWidth: W, templateHeight: H, fields } = get();
        const n = fields.length + 1;
        const label = n === 1 ? "Guest name" : `Field ${n}`;
        const style = defaultTextStyle(H);
        const w = box?.w ?? Math.round(W * 0.6);
        const h = box?.h ?? Math.round(style.fontSize * 1.6);
        const field: TextField = {
          id: nanoid(10),
          key: uniqueKey(slugifyKey(label), fields.map((f) => f.key)),
          label,
          type: "text",
          multiline: false,
          required: true,
          sampleValue: n === 1 ? "Dr. Wanjiru Kamau" : "Sample text",
          box: {
            x: box?.x ?? Math.round((W - w) / 2),
            y: box?.y ?? Math.round((H - h) / 2),
            w,
            h,
            rotation: 0,
          },
          style: { ...style, fontSize: box?.h ? Math.max(8, Math.round(box.h / 1.6)) : style.fontSize },
        };
        commit([...fields, field], { selectedId: field.id });
        return field.id;
      },

      duplicateField: (id) => {
        const { fields } = get();
        const source = fields.find((f) => f.id === id);
        if (!source) return;
        const copy: Field = {
          ...source,
          id: nanoid(10),
          key: uniqueKey(source.key, fields.map((f) => f.key)),
          label: `${source.label} copy`.slice(0, 60),
          box: { ...source.box, x: source.box.x + 20, y: source.box.y + 20 },
        };
        commit([...fields, copy], { selectedId: copy.id });
      },

      removeField: (id) => {
        const { fields, selectedId } = get();
        commit(
          fields.filter((f) => f.id !== id),
          { selectedId: selectedId === id ? null : selectedId },
        );
      },

      moveField: (id, direction) => {
        const fields = [...get().fields];
        const i = fields.findIndex((f) => f.id === id);
        const j = i + direction;
        if (i < 0 || j < 0 || j >= fields.length) return;
        [fields[i], fields[j]] = [fields[j]!, fields[i]!];
        commit(fields);
      },

      undo: () =>
        set((s) => {
          const previous = s.past[s.past.length - 1];
          if (!previous) return s;
          const selectedId = previous.some((f) => f.id === s.selectedId) ? s.selectedId : null;
          return { past: s.past.slice(0, -1), future: [s.fields, ...s.future], fields: previous, selectedId, revision: s.revision + 1 };
        }),

      redo: () =>
        set((s) => {
          const next = s.future[0];
          if (!next) return s;
          const selectedId = next.some((f) => f.id === s.selectedId) ? s.selectedId : null;
          return { past: [...s.past, s.fields], future: s.future.slice(1), fields: next, selectedId, revision: s.revision + 1 };
        }),
    };
  });
}

export type EditorStore = ReturnType<typeof createEditorStore>;

export const EditorContext = createContext<EditorStore | null>(null);

export function useEditor<T>(selector: (state: EditorState) => T): T {
  const store = useContext(EditorContext);
  if (!store) throw new Error("useEditor must be used inside <EditorContext>");
  return useStore(store, selector);
}

export function useEditorStore(): EditorStore {
  const store = useContext(EditorContext);
  if (!store) throw new Error("useEditorStore must be used inside <EditorContext>");
  return store;
}

export function useSelectedField(): Field | null {
  return useEditor((s) => s.fields.find((f) => f.id === s.selectedId) ?? null);
}
