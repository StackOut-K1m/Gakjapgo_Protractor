import { useState } from 'react';

import { downloadReportPdfFile, getMyReports } from '@/api/reportApi';
import { useAsync } from '@/hooks/useAsync';
import styles from './PastReportList.module.css';

/** '2026-07-20' → '2026.07.20'. 목록에서 리포트 대상 기간을 보여줄 때 쓴다 */
function formatPeriod(from: string, to: string) {
  const dot = (d: string) => d.replaceAll('-', '.');
  return `${dot(from)} ~ ${dot(to)}`;
}

/**
 * 이미 만들어 둔 리포트 목록과 다시 내려받기.
 *
 * 주간 리포트 화면이 쓴다. 예전에는 요약 카드(ReportOverviewCard)에 목록이 딸려 있었는데,
 * 그 카드의 등급·그래프가 리포트 화면 위쪽 내용과 통째로 겹쳐서 목록만 떼어냈다.
 */
export default function PastReportList() {
  const reports = useAsync(() => getMyReports(0, 5), []);
  const [msg, setMsg] = useState('');
  /** 목록에서 내려받는 중인 리포트 id (버튼별 로딩 표시용) */
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  /**
   * 완료된 리포트를 다시 내려받는다. 생성 없이 보관된 PDF 만 가져온다.
   *
   * 파일 이름은 서버가 정한 것을 쓴다 — 리포트 기간이 들어 있어 어느 주차인지 바로 보인다.
   */
  const handleDownload = async (reportId: number) => {
    setDownloadingId(reportId);
    setMsg('');
    try {
      const { blob, fileName } = await downloadReportPdfFile(reportId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '리포트 다운로드에 실패했습니다.');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <section className={styles['card']}>
      <h2 className={styles['title']}>지난 주간 리포트 보기</h2>

      {reports.loading && <p className={styles['state']}>불러오는 중…</p>}
      {reports.error && (
        <p className={styles['state']} data-error="true">
          {reports.error}
        </p>
      )}
      {/* 다운로드 실패 사유(미생성·파일 없음 등)를 삼키지 않고 보여준다 */}
      {msg && (
        <p className={styles['state']} data-error="true">
          {msg}
        </p>
      )}

      {reports.data && reports.data.reports.length === 0 && (
        <p className={styles['state']}>
          아직 만든 리포트가 없습니다. 아래 버튼으로 이번 주 리포트를 만들어
          보세요.
        </p>
      )}

      {reports.data && reports.data.reports.length > 0 && (
        <ul className={styles['list']}>
          {reports.data.reports.map((r) => (
            <li key={r.reportId} className={styles['row']}>
              {/* 어느 주차 리포트인지가 제목보다 중요하다. 기간을 앞세우고 제목은 보조로 둔다 */}
              <span className={styles['row-title']}>
                {formatPeriod(r.from, r.to)}
                <span className={styles['row-subtitle']}>{r.title}</span>
              </span>
              <span className={styles['row-actions']}>
                <span className={styles['row-status']}>{r.status}</span>
                {/*
                  상태·파일 존재를 서버가 종합해 downloadable 로 내려준다. 화면이 조건을 다시
                  조립하면(status === 'COMPLETED') 서버의 실제 차단 조건과 어긋날 수 있다 —
                  예를 들어 PDF 파일만 사라진 경우는 화면 조건으로는 알 수 없다.
                */}
                {r.downloadable && (
                  <button
                    type="button"
                    className={styles['row-download']}
                    disabled={downloadingId === r.reportId}
                    onClick={() => handleDownload(r.reportId)}
                  >
                    {downloadingId === r.reportId ? '내려받는 중…' : '다운로드'}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
