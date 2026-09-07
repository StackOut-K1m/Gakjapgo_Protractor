// src/lib/timelapse/frameStore.ts
//
// 타임랩스 프레임을 IndexedDB 에 잠깐 맡겨 두는 곳.
//
// 스터디룸에서 종료 화면으로는 navigate(state) 로 넘어가지만, 그 길로는 이미지를 못 보낸다.
// history.state 는 구조화 복제라 Blob 자체는 담기는데 브라우저마다 수백 KB~2MB 상한이 있고
// 타임랩스는 수 MB 라 조용히 실패한다. 그래서 여기를 경유한다.
//
// 서버에는 올리지 않는다. 사용자 얼굴이 담긴 이미지라 보관 동의·수명주기·비용이 전부 따라오는데,
// 이 기능은 "종료 직후 한 번 돌아보는" 용도라 그만한 값어치가 없다.
import type { PostureLight } from '@/types/posture';

const DB_NAME = 'gakjapgo-timelapse';
const DB_VERSION = 1;
const STORE = 'sessions';

export interface TimelapseFrame {
  /** 세션 시작 기준 경과 밀리초. 재생 중 "01:23:40 경과" 표시에 쓴다 */
  atMillis: number;
  /** 그 시점 자세. 재생 막대의 색이 된다 */
  light: PostureLight;
  blob: Blob;
}

export interface TimelapseSession {
  sessionKey: string;
  savedAt: number;
  /** 캡처 간격(ms). 솎아내기로 늘어나므로 마지막 값을 남긴다 */
  strideMillis: number;
  frames: TimelapseFrame[];
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'sessionKey' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  body: (store: IDBObjectStore) => IDBRequest<T> | null,
): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = body(tx.objectStore(STORE));
        // 요청 자체가 아니라 트랜잭션 완료를 기다린다. 쓰기는 oncomplete 전까지 확정이 아니다.
        tx.oncomplete = () => {
          db.close();
          resolve(request ? request.result : null);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

/**
 * 세션 하나를 통째로 저장한다. 이전 세션은 지운다.
 *
 * 타임랩스는 종료 화면에서 한 번 보고 버리는 것이라 여러 개를 들고 있을 이유가 없다.
 * 지우지 않으면 세션마다 수 MB 씩 쌓여 사용자 저장 공간을 말없이 먹는다.
 */
export async function saveTimelapse(session: TimelapseSession): Promise<void> {
  await runTransaction('readwrite', (store) => {
    store.clear();
    return store.put(session) as IDBRequest<IDBValidKey>;
  });
}

export async function loadTimelapse(
  sessionKey: string,
): Promise<TimelapseSession | null> {
  const found = await runTransaction<TimelapseSession | undefined>(
    'readonly',
    (store) => store.get(sessionKey) as IDBRequest<TimelapseSession | undefined>,
  );
  return found ?? null;
}

export async function clearTimelapse(): Promise<void> {
  await runTransaction('readwrite', (store) => {
    store.clear();
    return null;
  });
}

/** 브라우저가 IndexedDB 를 막아 두었는지(시크릿 모드 등). 막혀 있으면 기능을 아예 숨긴다. */
export function isTimelapseStorageAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}
