import { useCallback, useEffect, useRef, useState } from 'react';

import { getApiErrorMessage } from '@/api/client';
import { searchMembers } from '@/api/friendApi';
import type { FriendItem } from '@/types/friend';

/**
 * 입력이 멈춘 뒤 검색을 보내기까지 기다리는 시간(ms).
 *
 * 글자마다 보내면 '김지우'를 치는 동안 요청이 세 번 나가고, 앞 두 번의 결과는 버려진다.
 * 너무 길면 다 치고 나서도 결과가 안 나온 것처럼 느껴진다.
 */
const DEBOUNCE_MS = 400;

/**
 * 닉네임으로 회원을 찾는다. 친구가 아닌 사람을 찾는 유일한 경로다.
 *
 * 결과에는 각 회원의 나 기준 관계 상태가 함께 오므로, 버튼은 그 값으로 그린다
 * (lib/friend/relationship.ts 의 searchRowView).
 *
 * 빈 검색어로는 요청하지 않는다 — 서버가 keyword 를 필수로 요구하고, 무엇을 찾는지도 없이
 * 전체 회원을 훑을 이유가 없다.
 */
export function useFriendSearch() {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<FriendItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 결과가 어떤 검색어의 것인지. 입력만 하고 아직 안 보낸 구간을 구분하는 데 쓴다 */
  const [searchedKeyword, setSearchedKeyword] = useState('');

  /** 늦게 도착한 응답이 최신 결과를 덮지 않게 한다 */
  const requestSeq = useRef(0);

  const search = useCallback(async (raw: string) => {
    const trimmed = raw.trim();
    const seq = ++requestSeq.current;

    if (!trimmed) {
      setResults([]);
      setSearchedKeyword('');
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await searchMembers(trimmed);
      if (seq !== requestSeq.current) return;
      setResults(data.friends);
      setSearchedKeyword(trimmed);
    } catch (e) {
      if (seq !== requestSeq.current) return;
      setResults([]);
      setError(getApiErrorMessage(e, '검색에 실패했습니다.'));
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, []);

  // 입력이 멈추면 보낸다. 다음 글자가 들어오면 타이머가 새로 잡히면서 앞 요청은 취소된다.
  useEffect(() => {
    const timer = window.setTimeout(() => void search(keyword), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [keyword, search]);

  /**
   * 같은 검색어로 다시 받는다. 신청·수락·거절 뒤에 부른다 —
   * 그러지 않으면 버튼이 눌린 채로 옛 관계 상태를 계속 보여준다.
   */
  const refresh = useCallback(() => void search(keyword), [search, keyword]);

  return {
    keyword,
    setKeyword,
    results,
    loading,
    error,
    /** 검색어를 넣었는데 아직 결과가 없는 상태와 "찾은 게 없음"을 구분하는 데 쓴다 */
    searched: searchedKeyword.length > 0,
    refresh,
  };
}
