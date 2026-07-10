/**
 * ConfigEditor
 * ------------
 * A React wrapper around CodeMirror 6 used to edit Klipper / Moonraker
 * configuration files (printer.cfg, moonraker.conf, ...). These files are
 * INI / properties-style, so highlighting is provided by the `properties`
 * StreamLanguage from @codemirror/legacy-modes.
 *
 * Features:
 *   - Line numbers, undo/redo history, active-line highlighting.
 *   - Syntax highlighting (properties mode).
 *   - Search / replace panel (Ctrl+F) via @codemirror/search.
 *   - oneDark theme when `dark` is true, default light theme otherwise.
 *   - Keyboard shortcuts:
 *       Ctrl/Cmd+S       -> onSave (preventDefault, no browser save dialog)
 *       Ctrl/Cmd+Shift+S -> onSaveAndRestart
 *
 * Behaviour notes:
 *   The EditorView is created once and kept alive across renders. We only push
 *   the incoming `value` into the document when it differs from the current doc
 *   (e.g. a different file was selected, or content was reloaded from disk) so
 *   we never fight the user's typing or reset their cursor while editing.
 *   Callback props are held in a ref so the long-lived keymap/listener always
 *   sees the latest handlers without rebuilding the editor.
 */
import React, { useEffect, useRef } from "react";
import { EditorState, Compartment, type Extension } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  StreamLanguage,
  bracketMatching,
} from "@codemirror/language";
import { properties } from "@codemirror/legacy-modes/mode/properties";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { oneDark } from "@codemirror/theme-one-dark";

export interface ConfigEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  dark?: boolean;
  onSave?: () => void;
  onSaveAndRestart?: () => void;
}

/** Handlers kept in a ref so the long-lived editor always calls the latest. */
interface EditorHandlers {
  onChange: (value: string) => void;
  onSave?: () => void;
  onSaveAndRestart?: () => void;
}

const propertiesLanguage = StreamLanguage.define(properties);

export const ConfigEditor: React.FC<ConfigEditorProps> = ({
  value,
  onChange,
  readOnly = false,
  dark = true,
  onSave,
  onSaveAndRestart,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const handlersRef = useRef<EditorHandlers>({ onChange, onSave, onSaveAndRestart });
  // Compartments let us reconfigure theme / read-only without a full rebuild.
  const themeCompartment = useRef(new Compartment());
  const readOnlyCompartment = useRef(new Compartment());

  // Keep the latest handlers reachable from the static keymap/listener.
  handlersRef.current = { onChange, onSave, onSaveAndRestart };

  // Create the editor exactly once (on mount).
  useEffect(() => {
    if (!containerRef.current) return;

    const saveKeymap = keymap.of([
      {
        key: "Mod-s",
        preventDefault: true,
        run: () => {
          handlersRef.current.onSave?.();
          return true;
        },
      },
      {
        key: "Mod-Shift-s",
        preventDefault: true,
        run: () => {
          handlersRef.current.onSaveAndRestart?.();
          return true;
        },
      },
    ]);

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        handlersRef.current.onChange(update.state.doc.toString());
      }
    });

    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      history(),
      bracketMatching(),
      closeBrackets(),
      highlightSelectionMatches(),
      propertiesLanguage,
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      // Save shortcuts must come before defaultKeymap so Mod-s wins.
      saveKeymap,
      keymap.of([
        ...closeBracketsKeymap,
        ...searchKeymap,
        ...historyKeymap,
        indentWithTab,
        ...defaultKeymap,
      ]),
      updateListener,
      EditorView.lineWrapping,
      themeCompartment.current.of(dark ? oneDark : []),
      readOnlyCompartment.current.of(
        EditorState.readOnly.of(readOnly),
      ),
    ];

    const state = EditorState.create({
      doc: value,
      extensions,
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Intentionally run once; external value/theme/readOnly are synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync incoming value into the doc only when it truly differs, so we never
  // clobber the user's in-progress typing or move their cursor.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  // Reconfigure the theme without rebuilding the editor.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompartment.current.reconfigure(dark ? oneDark : []),
    });
  }, [dark]);

  // Reconfigure read-only without rebuilding the editor.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyCompartment.current.reconfigure(
        EditorState.readOnly.of(readOnly),
      ),
    });
  }, [readOnly]);

  return <div className="config-editor-container" ref={containerRef} />;
};

export default ConfigEditor;
