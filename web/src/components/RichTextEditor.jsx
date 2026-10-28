import { useEffect, useMemo, useState } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  faBold,
  faCode,
  faItalic,
  faListOl,
  faListUl,
  faParagraph,
  faHeading,
  faRotateLeft,
  faRotateRight,
} from '@fortawesome/free-solid-svg-icons';
import IconButton from './IconButton';
import { sanitizeRichTextHtml } from './richTextSanitize';

// Editor of a case write-up, limited to what the content standard allows: sections (h2), paragraphs, bold subtitles
// and item labels, italic, bulleted and numbered lists. "Seção" inserts one of the fixed section names of the
// language being edited, so the titles never drift from the standard.
function RichTextEditor({ value, onChange, sections = [], label }) {
  const [sourceMode, setSourceMode] = useState(false);
  const [sourceHtml, setSourceHtml] = useState(value || '');

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [2] },
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        hardBreak: false,
        strike: false,
        underline: false,
        link: false,
      }),
    ],
    []
  );

  const editor = useEditor({
    extensions,
    content: sanitizeRichTextHtml(value || ''),
    editorProps: {
      attributes: { class: 'rich-editor-content', 'aria-label': label || 'Descrição' },
    },
    onUpdate({ editor: nextEditor }) {
      const html = sanitizeRichTextHtml(nextEditor.getHTML());
      if (html !== sanitizeRichTextHtml(value || '')) onChange(html);
    },
  });

  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      heading: current?.isActive('heading', { level: 2 }) ?? false,
      bold: current?.isActive('bold') ?? false,
      italic: current?.isActive('italic') ?? false,
      bullet: current?.isActive('bulletList') ?? false,
      ordered: current?.isActive('orderedList') ?? false,
    }),
  });

  useEffect(() => {
    if (!editor) return;
    const incoming = sanitizeRichTextHtml(value || '');
    if (incoming !== sanitizeRichTextHtml(editor.getHTML()) && !editor.isFocused) {
      editor.commands.setContent(incoming, { emitUpdate: false });
    }
  }, [editor, value]);

  const run = (command) => () => command(editor?.chain().focus())?.run();

  const insertSection = (event) => {
    const name = event.target.value;
    event.target.value = '';
    if (!name || !editor) return;
    editor.chain().focus().insertContent(`<h2>${name}</h2><p></p>`).run();
  };

  const applySourceHtml = () => {
    if (!editor) return;
    const sanitized = sanitizeRichTextHtml(sourceHtml);
    editor.commands.setContent(sanitized, { emitUpdate: false });
    onChange(sanitized);
    setSourceMode(false);
  };

  return (
    <div className="rich-editor">
      <div className="rich-toolbar" role="toolbar" aria-label="Formatação">
        <IconButton icon={faParagraph} iconOnly variant="ghost" ariaLabel="Parágrafo" onClick={run((c) => c.setParagraph())} disabled={sourceMode} />
        <IconButton icon={faHeading} iconOnly variant="ghost" ariaLabel="Título de seção" aria-pressed={active?.heading} onClick={run((c) => c.toggleHeading({ level: 2 }))} disabled={sourceMode} />
        <span className="rich-toolbar__gap" aria-hidden="true" />
        <IconButton icon={faBold} iconOnly variant="ghost" ariaLabel="Negrito (subtítulos e rótulos)" aria-pressed={active?.bold} onClick={run((c) => c.toggleBold())} disabled={sourceMode} />
        <IconButton icon={faItalic} iconOnly variant="ghost" ariaLabel="Itálico" aria-pressed={active?.italic} onClick={run((c) => c.toggleItalic())} disabled={sourceMode} />
        <span className="rich-toolbar__gap" aria-hidden="true" />
        <IconButton icon={faListUl} iconOnly variant="ghost" ariaLabel="Lista" aria-pressed={active?.bullet} onClick={run((c) => c.toggleBulletList())} disabled={sourceMode} />
        <IconButton icon={faListOl} iconOnly variant="ghost" ariaLabel="Lista numerada" aria-pressed={active?.ordered} onClick={run((c) => c.toggleOrderedList())} disabled={sourceMode} />
        <span className="rich-toolbar__gap" aria-hidden="true" />
        <IconButton icon={faRotateLeft} iconOnly variant="ghost" ariaLabel="Desfazer" onClick={run((c) => c.undo())} disabled={sourceMode} />
        <IconButton icon={faRotateRight} iconOnly variant="ghost" ariaLabel="Refazer" onClick={run((c) => c.redo())} disabled={sourceMode} />
        {sections.length ? (
          <span className="select rich-toolbar__sections">
            <select aria-label="Inserir seção do padrão" defaultValue="" onChange={insertSection} disabled={sourceMode}>
              <option value="">Inserir seção…</option>
              {sections.map((name) => (
                <option key={name} value={name.replace('?', '')}>
                  {name.replace('?', '')}
                  {name.endsWith('?') ? ' (opcional)' : ''}
                </option>
              ))}
            </select>
          </span>
        ) : null}
        <IconButton
          icon={faCode}
          iconOnly
          variant="ghost"
          ariaLabel="Editar o HTML"
          aria-pressed={sourceMode}
          className="rich-toolbar__source"
          onClick={() => {
            if (!sourceMode) setSourceHtml(sanitizeRichTextHtml(value || ''));
            setSourceMode(!sourceMode);
          }}
        />
      </div>

      {sourceMode ? (
        <div className="rich-source">
          <textarea
            className="input rich-source__text"
            value={sourceHtml}
            spellCheck={false}
            aria-label="HTML da descrição"
            onChange={(event) => setSourceHtml(event.target.value)}
          />
          <div className="rich-source__actions">
            <IconButton variant="outline" onClick={() => setSourceMode(false)}>
              Cancelar
            </IconButton>
            <IconButton icon={faCode} variant="primary" onClick={applySourceHtml}>
              Aplicar HTML
            </IconButton>
          </div>
        </div>
      ) : (
        <EditorContent editor={editor} />
      )}
    </div>
  );
}

export default RichTextEditor;
