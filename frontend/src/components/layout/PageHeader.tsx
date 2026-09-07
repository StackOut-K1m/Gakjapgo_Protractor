// src/components/layout/PageHeader.tsx
import type { ReactNode } from 'react';
import styles from './PageHeader.module.css';

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumb?: string;
  /** 우측에 놓을 버튼 등 */
  actions?: ReactNode;
}

export default function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
}: PageHeaderProps) {
  return (
    <div className={styles['page-header']}>
      <div className={styles['page-header-inner']}>
        <div className={styles['page-header-text']}>
          {breadcrumb && <p className={styles['breadcrumb']}>{breadcrumb}</p>}
          <h1 className={styles['page-title']}>{title}</h1>
          {description && (
            <p className={styles['page-description']}>{description}</p>
          )}
        </div>
        {actions && <div className={styles['page-header-actions']}>{actions}</div>}
      </div>
    </div>
  );
}