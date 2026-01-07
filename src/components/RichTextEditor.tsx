import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Underline } from '@tiptap/extension-underline';
import { TextAlign } from '@tiptap/extension-text-align';
import { Link } from '@tiptap/extension-link';
import { 
  Bold, Italic, Underline as UnderlineIcon, 
  AlignLeft, AlignCenter, AlignRight, 
  List, ListOrdered, 
  Heading1, Heading2, 
  Table as TableIcon, Plus, Trash2, 
  Undo, Redo, 
  Link as LinkIcon
} from 'lucide-react';
import { cn } from '../lib/utils';

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  editable?: boolean;
}

const MenuBar = ({ editor }: { editor: any }) => {
  if (!editor) {
    return null;
  }

  const addTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 p-2 flex flex-wrap gap-1 sticky top-0 bg-white dark:bg-gray-800 z-10">
      <div className="flex gap-1 border-r border-gray-200 dark:border-gray-700 pr-2 mr-2">
        <button
          type="button"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50"
          title="Rückgängig"
        >
          <Undo size={18} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50"
          title="Wiederherstellen"
        >
          <Redo size={18} />
        </button>
      </div>

      <div className="flex gap-1 border-r border-gray-200 dark:border-gray-700 pr-2 mr-2">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={cn(
            "p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300",
            editor.isActive('bold') && "bg-gray-200 dark:bg-gray-600 text-black dark:text-white"
          )}
          title="Fett"
        >
          <Bold size={18} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={cn(
            "p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300",
            editor.isActive('italic') && "bg-gray-200 dark:bg-gray-600 text-black dark:text-white"
          )}
          title="Kursiv"
        >
          <Italic size={18} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={cn(
            "p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300",
            editor.isActive('underline') && "bg-gray-200 dark:bg-gray-600 text-black dark:text-white"
          )}
          title="Unterstrichen"
        >
          <UnderlineIcon size={18} />
        </button>
      </div>

      <div className="flex gap-1 border-r border-gray-200 dark:border-gray-700 pr-2 mr-2">
        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          className={cn(
            "p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300",
            editor.isActive({ textAlign: 'left' }) && "bg-gray-200 dark:bg-gray-600 text-black dark:text-white"
          )}
          title="Links"
        >
          <AlignLeft size={18} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          className={cn(
            "p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300",
            editor.isActive({ textAlign: 'center' }) && "bg-gray-200 dark:bg-gray-600 text-black dark:text-white"
          )}
          title="Zentriert"
        >
          <AlignCenter size={18} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          className={cn(
            "p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300",
            editor.isActive({ textAlign: 'right' }) && "bg-gray-200 dark:bg-gray-600 text-black dark:text-white"
          )}
          title="Rechts"
        >
          <AlignRight size={18} />
        </button>
      </div>

      <div className="flex gap-1 border-r border-gray-200 dark:border-gray-700 pr-2 mr-2">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={cn(
            "p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300",
            editor.isActive('heading', { level: 1 }) && "bg-gray-200 dark:bg-gray-600 text-black dark:text-white"
          )}
          title="Überschrift 1"
        >
          <Heading1 size={18} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={cn(
            "p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300",
            editor.isActive('heading', { level: 2 }) && "bg-gray-200 dark:bg-gray-600 text-black dark:text-white"
          )}
          title="Überschrift 2"
        >
          <Heading2 size={18} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={cn(
            "p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300",
            editor.isActive('bulletList') && "bg-gray-200 dark:bg-gray-600 text-black dark:text-white"
          )}
          title="Liste"
        >
          <List size={18} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={cn(
            "p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300",
            editor.isActive('orderedList') && "bg-gray-200 dark:bg-gray-600 text-black dark:text-white"
          )}
          title="Nummerierung"
        >
          <ListOrdered size={18} />
        </button>
      </div>

      <div className="flex gap-1">
        <button
          type="button"
          onClick={addTable}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
          title="Tabelle einfügen"
        >
          <TableIcon size={18} />
        </button>
        
        {editor.isActive('table') && (
            <>
                <button
                type="button"
                onClick={() => editor.chain().focus().addColumnAfter().run()}
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                title="Spalte hinzufügen"
                >
                <Plus size={18} className="rotate-90" />
                </button>
                <button
                type="button"
                onClick={() => editor.chain().focus().addRowAfter().run()}
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                title="Zeile hinzufügen"
                >
                <Plus size={18} />
                </button>
                <button
                type="button"
                onClick={() => editor.chain().focus().deleteTable().run()}
                className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400"
                title="Tabelle löschen"
                >
                <Trash2 size={18} />
                </button>
            </>
        )}
      </div>
    </div>
  );
};

const RichTextEditor: React.FC<RichTextEditorProps> = ({ content, onChange, editable = true }) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Link.configure({
        openOnClick: false,
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: content,
    editable: editable,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose dark:prose-invert max-w-none focus:outline-none min-h-[300px] p-4',
      },
    },
  });

  // Update content if changed externally (e.g. loading)
  React.useEffect(() => {
    if (editor && content !== editor.getHTML()) {
        // Only update if significantly different to avoid cursor jumps
        // For simple cases, this might be okay. Ideally, we track transaction origin.
        if (editor.getText() === '' && content !== '') {
             editor.commands.setContent(content);
        }
    }
  }, [content, editor]);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-800 flex flex-col h-full">
      {editable && <MenuBar editor={editor} />}
      <div className="flex-1 overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};

export default RichTextEditor;
