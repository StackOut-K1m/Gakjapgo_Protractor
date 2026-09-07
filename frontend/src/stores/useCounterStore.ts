import { create } from 'zustand';

// 상태관리 동작 확인용 샘플 스토어입니다.
// 실제 도메인 스토어(useAuthStore, useSessionStore 등)를 만들 때 이 패턴을 따라 주세요.
interface CounterState {
  count: number;
  increase: () => void;
  decrease: () => void;
  reset: () => void;
}

export const useCounterStore = create<CounterState>((set) => ({
  count: 0,
  increase: () => set((state) => ({ count: state.count + 1 })),
  decrease: () => set((state) => ({ count: state.count - 1 })),
  reset: () => set({ count: 0 }),
}));
