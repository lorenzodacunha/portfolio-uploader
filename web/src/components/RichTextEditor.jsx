import { useEffect, useMemo, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import Youtube from '@tiptap/extension-youtube';
import HardBreak from '@tiptap/extension-hard-break';
import { Node } from '@tiptap/core';
import {
  faAlignCenter,
  faAlignJustify,
  faAlignLeft,
  faAlignRight,
  faBold,
  faCode,
  faItalic,
  faLink,
  faListOl,
  faListUl,
  faOutdent,
  faIndent,
  faTable,
  faUnderline,
  faImage,
  faVideo,
  faRotateLeft,
  faRotateRight,
  faLinkSlash,
} from '@fortawesome/free-solid-svg-icons';
import IconButton from './IconButton';
import { sanitizeRichTextHtml } from './richTextSanitize';

const ALLOWED_VIDEO_HOSTS = ['youtube.com', 'www.youtube.com', 'youtu.be', 'player.vimeo.com', 'vimeo.com'];

const Iframe = Node.create({
  name: 'iframe',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      src: { default: null },
      width: { default: '640' },
      height: { default: '360' },
      frameborder: { default: '0' },
      allow: { default: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture' },
      allowfullscreen: { default: 'true' },
      title: { default: 'Video embed' },
    };
  },
  parseHTML() {
    return [{ tag: 'iframe' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['iframe', HTMLAttributes];
  },
  addCommands() {
    return {
      setIframe:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});

function normalizeVideoUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!ALLOWED_VIDEO_HOSTS.includes(host)) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function RichTextEditor({ value, onChange }) {
  const [sourceMode, setSourceMode] = useState(false);
  const [sourceHtml, setSourceHtml] = useState(value || '');
  const [currentColor, setCurrentColor] = useState('#1f2937');

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline.extend({
        addKeyboardShortcuts() {
          return {
            'Mod-u': () => this.editor.commands.toggleUnderline(),
          };
        },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
      }),
      TextStyle,
      Color,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Image.configure({ inline: false }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Youtube.configure({
        controls: true,
        nocookie: false,
      }),
      Iframe,
      HardBreak,
    ],
    []
  );

  const editor = useEditor({
    extensions,
    content: sanitizeRichTextHtml(value || ''),
    editorProps: {
      attributes: {
        class: 'rich-editor-content',
      },
      handleKeyDown(view, event) {
        if (event.key === 'Tab') {
          if (event.shiftKey) {
            if (editor?.can().liftListItem('listItem')) {
              event.preventDefault();
              return editor.chain().focus().liftListItem('listItem').run();
            }
            return false;
          }
          if (editor?.can().sinkListItem('listItem')) {
            event.preventDefault();
            return editor.chain().focus().sinkListItem('listItem').run();
          }
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
          event.preventDefault();
          return editor?.chain().focus().redo().run() || false;
        }
        return false;
      },
    },
    onUpdate({ editor: nextEditor }) {
      const html = sanitizeRichTextHtml(nextEditor.getHTML());
      onChange(html);
      if (!sourceMode) {
        setSourceHtml(html);
      }
    },
  });

  useEffect(() => {
    if (!editor) return;
    const incoming = sanitizeRichTextHtml(value || '');
    const current = sanitizeRichTextHtml(editor.getHTML());
    if (incoming !== current) {
      editor.commands.setContent(incoming, false);
    }
    if (!sourceMode) {
      setSourceHtml(incoming);
    }
  }, [editor, value, sourceMode]);

  const applySourceHtml = () => {
    if (!editor) return;
    const sanitized = sanitizeRichTextHtml(sourceHtml);
    editor.commands.setContent(sanitized, false);
    onChange(sanitized);
  };

  const setParagraphStyle = (event) => {
    const value = event.target.value;
    if (!editor) return;
    if (value === 'paragraph') {
      editor.chain().focus().setParagraph().run();
      return;
    }
    const level = Number(value.replace('h', ''));
    if ([1, 2, 3].includes(level)) {
      editor.chain().focus().toggleHeading({ level }).run();
    }
  };

  const setLink = () => {
    if (!editor) return;
    const previous = editor.getAttributes('link').href || '';
    const url = window.prompt('Informe a URL do link', previous);
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  const insertImage = () => {
    if (!editor) return;
    const src = window.prompt('Informe a URL da imagem');
    if (!src?.trim()) return;
    editor.chain().focus().setImage({ src: src.trim() }).run();
  };

  const insertVideo = () => {
    if (!editor) return;
    const raw = window.prompt('Informe URL do vídeo (YouTube ou Vimeo)');
    if (!raw?.trim()) return;

    const normalized = normalizeVideoUrl(raw.trim());
    if (!normalized) {
      window.alert('URL inválida. Apenas YouTube ou Vimeo.');
      return;
    }

    const hostname = new URL(normalized).hostname.toLowerCase();
    if (hostname.includes('youtube') || hostname.includes('youtu.be')) {
      editor.chain().focus().setYoutubeVideo({ src: normalized, width: 640, height: 360 }).run();
      return;
    }

    editor
      .chain()
      .focus()
      .setIframe({
        src: normalized,
        width: '640',
        height: '360',
      })
      .run();
  };

  const currentBlockType = editor?.isActive('heading', { level: 1 })
    ? 'h1'
    : editor?.isActive('heading', { level: 2 })
      ? 'h2'
      : editor?.isActive('heading', { level: 3 })
        ? 'h3'
        : 'paragraph';

  return (
    <div className="rich-editor-shell">
      <div className="rich-toolbar">
        <select className="rich-select" value={currentBlockType} onChange={setParagraphStyle}>
          <option value="paragraph">Parágrafo</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>

        <IconButton icon={faBold} iconOnly ariaLabel="Negrito" onClick={() => editor?.chain().focus().toggleBold().run()} />
        <IconButton icon={faItalic} iconOnly ariaLabel="Itálico" onClick={() => editor?.chain().focus().toggleItalic().run()} />
        <IconButton icon={faUnderline} iconOnly ariaLabel="Sublinhado" onClick={() => editor?.chain().focus().toggleUnderline().run()} />

        <label className="color-picker-label" aria-label="Cor do texto">
          A
          <input
            type="color"
            value={currentColor}
            onChange={(event) => {
              const color = event.target.value;
              setCurrentColor(color);
              editor?.chain().focus().setColor(color).run();
            }}
          />
        </label>

        <IconButton icon={faAlignLeft} iconOnly ariaLabel="Alinhar à esquerda" onClick={() => editor?.chain().focus().setTextAlign('left').run()} />
        <IconButton icon={faAlignCenter} iconOnly ariaLabel="Alinhar ao centro" onClick={() => editor?.chain().focus().setTextAlign('center').run()} />
        <IconButton icon={faAlignRight} iconOnly ariaLabel="Alinhar à direita" onClick={() => editor?.chain().focus().setTextAlign('right').run()} />
        <IconButton icon={faAlignJustify} iconOnly ariaLabel="Justificar" onClick={() => editor?.chain().focus().setTextAlign('justify').run()} />

        <IconButton icon={faLink} iconOnly ariaLabel="Inserir link" onClick={setLink} />
        <IconButton icon={faLinkSlash} iconOnly ariaLabel="Remover link" onClick={() => editor?.chain().focus().unsetLink().run()} />
        <IconButton icon={faImage} iconOnly ariaLabel="Inserir imagem" onClick={insertImage} />
        <IconButton icon={faVideo} iconOnly ariaLabel="Inserir vídeo" onClick={insertVideo} />

        <details className="more-menu">
          <summary className="more-menu-trigger" aria-label="Mais opcoes">
            ⋯
          </summary>
          <div className="more-menu-content">
            <IconButton icon={faListUl} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
              Lista não ordenada
            </IconButton>
            <IconButton icon={faListOl} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
              Lista ordenada
            </IconButton>
            <IconButton icon={faIndent} onClick={() => editor?.chain().focus().sinkListItem('listItem').run()}>
              Indentar
            </IconButton>
            <IconButton icon={faOutdent} onClick={() => editor?.chain().focus().liftListItem('listItem').run()}>
              Outdent
            </IconButton>
            <IconButton icon={faTable} onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
              Inserir tabela
            </IconButton>
            <IconButton icon={faTable} onClick={() => editor?.chain().focus().deleteTable().run()}>
              Remover tabela
            </IconButton>
          </div>
        </details>

        <IconButton icon={faRotateLeft} iconOnly ariaLabel="Undo" onClick={() => editor?.chain().focus().undo().run()} />
        <IconButton icon={faRotateRight} iconOnly ariaLabel="Redo" onClick={() => editor?.chain().focus().redo().run()} />
        <IconButton
          icon={faCode}
          iconOnly
          ariaLabel="Alternar modo HTML"
          onClick={() => setSourceMode((state) => !state)}
          className={sourceMode ? 'active' : ''}
        />
      </div>

      {sourceMode ? (
        <div className="source-mode-wrap">
          <textarea
            className="source-editor"
            value={sourceHtml}
            onChange={(event) => setSourceHtml(event.target.value)}
          />
          <div className="source-actions">
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
