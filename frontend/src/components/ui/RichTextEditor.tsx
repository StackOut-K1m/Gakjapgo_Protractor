// src/components/ui/RichTextEditor.tsx
import { useRef } from 'react';
import styles from './RichTextEditor.module.css';

interface RichTextEditorProps {
  label: string;
  placeholder?: string;
  onChange?: (html: string) => void;
}

/**
 * 소개글 편집기.
 *
 * 굵게·밑줄 서식만 지원한다. 이미지는 넣을 수 없다 —
 * 방 대표 이미지는 별도의 "스터디방 썸네일" 항목에서 고른다.
 */
export default function RichTextEditor({
  label,
  placeholder,
  onChange,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  function emitChange() {
    onChange?.(editorRef.current?.innerHTML ?? '');
  }

  function execFormat(command: string) {
    editorRef.current?.focus();
    // TODO: execCommand는 폐기 예정 API — 추후 에디터 라이브러리로 교체 검토
    document.execCommand(command, false);
    emitChange();
  }

  /**
   * 붙여넣기는 서식·이미지를 지우고 평문만 넣는다.
   * 이렇게 하지 않으면 웹에서 복사한 <img> 가 그대로 들어와 이미지가 다시 생긴다.
   */
  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
    emitChange();
  }

  return (
    <div className={styles['editor-group']}>
      <span className={styles['editor-label']}>{label}</span>

      <div className={styles['rich-editor']}>
        <div className={styles['editor-toolbar']}>
          <button
            type="button"
            aria-label="굵게"
            onMouseDown={(e) => {
              e.preventDefault();
              execFormat('bold');
            }}
            className={styles['toolbar-btn']}
            data-variant="bold"
          >
            가
          </button>

          <button
            type="button"
            aria-label="밑줄"
            onMouseDown={(e) => {
              e.preventDefault();
              execFormat('underline');
            }}
            className={styles['toolbar-btn']}
            data-variant="underline"
          >
            U
          </button>
        </div>

        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={label}
          data-placeholder={placeholder}
          onInput={emitChange}
          onPaste={handlePaste}
          className={styles['editor-body']}
        />
      </div>
    </div>
  );
}
