import type { ReactNode } from 'react';

interface Props {
  /**
   * 카드 제목. 문자열 대신 요소도 받는다 — 제목 바로 옆에 붙는 것(도움말 아이콘 등)을
   * 두려면 여기여야 한다. actions 는 반대쪽 끝으로 밀리므로 그 자리가 안 된다.
   */
  title: ReactNode;
  /** 제목 줄 오른쪽 끝에 놓을 것 */
  actions?: ReactNode;
  children: ReactNode;
}

function SectionCard({ title, actions, children }: Props) {
  return (
    <section className="section-card">
      <div className="section-head">
        <h2>{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export default SectionCard;
