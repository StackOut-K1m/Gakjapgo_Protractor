interface Props {
  page: number; // 0부터 시작
  totalPages: number;
  onChange: (page: number) => void;
}

/** 이전 / 1 2 3 / 다음 페이지네이션. 페이지가 1쪽뿐이면 아무것도 그리지 않는다. */
function BoardPagination({ page, totalPages, onChange }: Props) {
  if (totalPages <= 1) return null;

  return (
    <div className="pagination">
      <button type="button" disabled={page === 0} onClick={() => onChange(page - 1)}>
        이전
      </button>
      {Array.from({ length: totalPages }, (_, i) => (
        <button
          key={i}
          type="button"
          className={`page-btn${page === i ? ' active' : ''}`}
          aria-current={page === i ? 'page' : undefined}
          onClick={() => onChange(i)}
        >
          {i + 1}
        </button>
      ))}
      <button
        type="button"
        disabled={page >= totalPages - 1}
        onClick={() => onChange(page + 1)}
      >
        다음
      </button>
    </div>
  );
}

export default BoardPagination;
