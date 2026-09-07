// src/components/ui/TagInput.tsx
import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import styles from './TagInput.module.css';

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
}

export default function TagInput({ tags, onChange }: TagInputProps) {
  const [inputValue, setInputValue] = useState('');

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const raw = inputValue.trim().replace(/^#/, '');
    if (!raw || tags.includes(`#${raw}`)) {
      setInputValue('');
      return;
    }
    onChange([...tags, `#${raw}`]);
    setInputValue('');
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  return (
    <div className={styles['tag-input-group']}>
      <label className={styles['tag-input-label']} htmlFor="hashtag-input">
        해시태그
      </label>
      <input
        id="hashtag-input"
        type="text"
        value={inputValue}
        placeholder="#해시태그를 입력하고 Enter를 눌러주세요"
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        className={styles['tag-text-input']}
      />
      {tags.length > 0 && (
        <div className={styles['tag-chip-list']}>
          {tags.map((tag) => (
            <span key={tag} className={styles['tag-chip']}>
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                aria-label={`${tag} 제거`}
                className={styles['tag-remove-btn']}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
