import {
  BlockQuote,
  Bold,
  ClassicEditor,
  Essentials,
  Heading,
  Italic,
  Link,
  List,
  Paragraph,
  SourceEditing,
  Table,
  TableToolbar,
  type EditorConfig,
} from 'ckeditor5';

export { ClassicEditor };

export const ckEditorConfig: EditorConfig = {
  licenseKey: 'GPL',
  plugins: [
    Essentials,
    Paragraph,
    Bold,
    Italic,
    Heading,
    Link,
    List,
    BlockQuote,
    Table,
    TableToolbar,
    SourceEditing,
  ],
  toolbar: [
    'heading',
    '|',
    'bold',
    'italic',
    'link',
    'bulletedList',
    'numberedList',
    'blockQuote',
    'insertTable',
    '|',
    'sourceEditing',
    'undo',
    'redo',
  ],
  table: {
    contentToolbar: ['tableColumn', 'tableRow', 'mergeTableCells'],
  },
};
