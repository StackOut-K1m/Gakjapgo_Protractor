// src/pages/HomePage.tsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { getMypageSummary } from '@/api/mypageApi';
import { getActiveUsers } from '@/api/publicStatsApi';
import { getHomeEvents, getHomeNotices } from '@/api/boardApi';
import {
  getMyRanking,
  getRankingPreview,
  type RankingPeriod,
  type RankingPreviewEntry,
} from '@/api/rankingApi';
import { getUpcomingSchedules } from '@/api/scheduleApi';
import { getStudySummary } from '@/api/studyRecordApi';
import {
  getRecommendedStudyRooms,
  getStudyRooms,
  studyTagName,
} from '@/api/studyRoomApi';
import DailyGoalCard from '@/components/home/DailyGoalCard';
import EventSection from '@/components/home/EventSection';
import HeroSection from '@/components/home/HeroSection';
import HowItWorksSection from '@/components/home/HowItWorksSection';
import SignalHero from '@/components/home/SignalHero';
import NoticeSection from '@/components/home/NoticeSection';
import RankingSection, {
  formatRankingTime,
} from '@/components/home/RankingSection';
import RecommendedRoomsCard from '@/components/home/RecommendedRoomCard';
import StudyRoomFinder from '@/components/home/StudyRoomFinder';
import ConsentRequiredDialog from '@/components/study/ConsentRequiredDialog';
import { useDetectionConsent } from '@/hooks/useDetectionConsent';
import { RECENT_EVENT_DAYS, daysAgo } from '@/lib/board/postDate';
import { formatStudyTime, formatWeekDiff } from '@/utils/formatStudyTime';
import { openRoomWindowAt } from '@/utils/openRoomWindow';
import { useAuthStore } from '@/stores/useAuthStore';
import type {
  EventItem,
  ExamCountdown,
  HomeSummary,
  Notice,
  RankingEntry,
  RecommendedRoom,
  StudyRoom,
} from '@/types/home';
import type { Schedule } from '@/types/schedule';
import type { StudySummary } from '@/types/studyRecord';
import { daysUntil, formatDDay } from '@/utils/calendar';
import styles from './HomePage.module.css';

/**
 * 상단 카드가 돌려 보여줄 D-day 일정 수.
 *
 * 서버가 받는 상한은 20이지만 10으로 끊는다. 10장이면 5초씩 돌아 한 바퀴에 50초라,
 * 이보다 늘리면 뒷장은 사실상 아무도 못 본다.
 */
const HERO_SCHEDULE_LIMIT = 10;

/** 히어로의 '작동 원리' 버튼이 찾아갈 설명 섹션의 앵커 */
const HOW_IT_WORKS_ID = 'how-it-works';

// 상단 카드 값(이름·접속자 수·연속 학습·이번 주 공부)은 전부 API 로 받는다.
// 예전에는 여기에 그럴듯한 기본 숫자(12일째·21h 30m·남의 이름)를 둬서, 새로고침할 때마다
// 그 값이 스쳐 지나갔다. 지금은 못 받으면 0 으로 둔다 — 기록이 없는 사람이 실제로 보는
// 화면과 같아서, 잘못 읽혀도 사실과 크게 다르지 않다.


// TODO: API 연동 — GET /api/home/today
// 오늘 공부한 시간은 API 로 받는다(studySummary). 여기 남은 것은 목표 시간의 기본값뿐이다 —
// 온보딩에서 목표를 정하지 않은 사람에게 쓴다. 가짜 기록이 아니라 기본 설정값이라 남겨 둔다.
const DEFAULT_GOAL_MINUTES = 360;

function formatHourMinute(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

export default function HomePage() {
  const navigate = useNavigate();
  const member = useAuthStore((s) => s.member);
  const [period, setPeriod] = useState('yesterday');
  const [rooms, setRooms] = useState<StudyRoom[]>([]);
  const [myRanking, setMyRanking] = useState<RankingEntry | null>(null);
  /**
   * 랭킹 집계 시각. 어떤 조회의 결과인지(누구·어느 기간) 키로 같이 들고 있는다.
   *
   * 효과 안에서 값을 비우지 않기 위해서다. 키를 비교하면 "지금 화면에 맞는 값인지"가
   * 저절로 나오고, 기간을 바꾸거나 로그아웃했을 때 이전 조회의 시각이 남지 않는다.
   */
  const [rankingUpdated, setRankingUpdated] = useState<{
    key: string;
    text: string;
  } | null>(null);
  const [recommendedRooms, setRecommendedRooms] = useState<RecommendedRoom[]>(
    [],
  );
  const [recommendationsLoading, setRecommendationsLoading] = useState(true);
  const [recommendationsError, setRecommendationsError] = useState(false);
  const [recommendationVersion, setRecommendationVersion] = useState(0);
  /** 감지 동의를 철회한 사용자에게 띄우는 안내 창 */
  const [consentRequired, setConsentRequired] = useState(false);

  const isLoggedIn = Boolean(member);
  const detectionConsent = useDetectionConsent(isLoggedIn);

  /**
   * 온보딩에서 정한 하루 목표 시간(분). GET /mypage/summary 가 내려준다.
   * 아직 안 정했으면 null 이고, 그때는 DEFAULT_GOAL_MINUTES 로 표시한다.
   */
  const [goalMinutes, setGoalMinutes] = useState<number | null>(null);

  /**
   * 오늘·이번주 공부 시간과 연속 학습일수. GET /study-records/me/summary 가 한 번에 준다.
   * 못 받으면 null 이고, 화면에는 0 으로 나간다.
   */
  const [studySummary, setStudySummary] = useState<StudySummary | null>(null);

  /** 지금 공부 중인 인원. 비로그인에도 보이는 값이라 로그인 여부와 무관하게 부른다. */
  const [activeUserCount, setActiveUserCount] = useState<number | null>(null);

  /** 기간별 상위 랭킹. 로그인 없이도 보이는 값이라 로그인 여부와 무관하게 부른다. */
  const [topRankings, setTopRankings] = useState<RankingPreviewEntry[]>([]);
  /** 홈에 띄울 최근 공지·이벤트. 게시판(NOTICE/EVENT)에서 최신순으로 몇 건만 가져온다. */
  const [notices, setNotices] = useState<Notice[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  /**
   * 최근 7일 안에 이벤트가 없어 최신 것으로 대신 채웠는지.
   *
   * 그냥 비워 두면 "이벤트가 없는 서비스"로 읽힌다. 무엇을 보여 주는지 화면에 밝힌다.
   */
  const [eventsFellBack, setEventsFellBack] = useState(false);

  /**
   * 상단 카드에 띄울 D-day 일정들. 비어 있으면 카드가 등록 안내로 바뀐다.
   *
   * 같은 날 시험이 겹치는 등 가까운 일정이 여러 개일 수 있어서 하나만 받지 않는다.
   * 카드는 이 목록을 한 장씩 돌려 보여준다.
   */
  const [upcomingSchedules, setUpcomingSchedules] = useState<Schedule[]>([]);

  // 캘린더에서 일정을 바꾸고 홈으로 돌아오면 새로 불러야 하므로 로그인 여부에만 묶어 둔다.
  // 로그아웃 시 값을 비우지 않는 이유는 아래 exams 가 로그인 여부를 같이 보기 때문이다
  // (효과 안에서 동기 setState 를 하지 않으려는 것이기도 하다).
  useEffect(() => {
    if (!isLoggedIn) return;
    let alive = true;
    getUpcomingSchedules(HERO_SCHEDULE_LIMIT)
      .then((list) => {
        if (alive) setUpcomingSchedules(list);
      })
      .catch((e) => {
        // 못 받아도 홈은 떠야 한다. 카드는 "일정 없음" 안내로 내려간다.
        // 다만 조용히 삼키면 서버 오류와 "일정이 없음"이 화면에서 똑같이 보인다. 콘솔에는 남긴다.
        console.error('다가오는 일정을 불러오지 못했습니다.', e);
        if (alive) setUpcomingSchedules([]);
      });
    return () => {
      alive = false;
    };
  }, [isLoggedIn]);

  // 마이페이지 요약은 인증이 필요하다. 비로그인에서 부르면 401 → 인터셉터가 로그인으로 튕긴다.
  // 로그아웃 시 값을 비우는 건 아래 todayGoalMinutes 에서 처리한다(효과 안에서 동기 setState 금지).
  useEffect(() => {
    if (!isLoggedIn) return;
    let alive = true;
    getMypageSummary()
      .then((data) => {
        if (alive) setGoalMinutes(data.goalMinutes);
      })
      .catch(() => {
        if (alive) setGoalMinutes(null);
      });
    return () => {
      alive = false;
    };
  }, [isLoggedIn]);

  /** 지금 화면이 필요로 하는 랭킹 조회가 무엇인지. 받아 둔 집계 시각이 이 조회의 것인지 가린다. */
  const rankingKey = `${member?.nickname ?? ''}-${period}`;

  useEffect(() => {
    if (!isLoggedIn) return;

    let alive = true;
    getMyRanking(period as RankingPeriod)
      .then((data) => {
        if (!alive) return;
        setRankingUpdated({
          key: rankingKey,
          text: `${new Intl.DateTimeFormat('ko-KR', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: 'Asia/Seoul',
          }).format(new Date(data.calculatedAt))} 기준`,
        });
        setMyRanking(
          data.rank === null || data.focusedSeconds === null
            ? null
            : {
                rank: data.rank,
                userName: member?.nickname ?? '',
                studyTime: formatRankingTime(data.focusedSeconds),
              },
        );
      })
      .catch(() => {
        if (alive) setMyRanking(null);
      });

    return () => {
      alive = false;
    };
  }, [isLoggedIn, member?.nickname, period, rankingKey]);

  /**
   * 화면에 넘길 집계 시각.
   *
   * 비로그인은 조회 자체를 하지 않으니 비운다. 로그인했더라도 지금 조회의 결과가 아직
   * 안 왔으면 "집계 중"으로 되돌린다 — 기간을 바꿨는데 이전 기간의 시각이 남아 있으면
   * 그 숫자가 새 기간의 것인 줄 읽힌다.
   */
  const rankingUpdatedAt = !isLoggedIn
    ? ''
    : rankingUpdated?.key === rankingKey
      ? rankingUpdated.text
      : '랭킹 집계 중';

  // 개인 학습 요약도 인증이 필요하다. 비로그인 화면에는 이 값을 쓰는 자리가 없다.
  useEffect(() => {
    // 비로그인은 이 값을 쓰는 자리가 없다.
    if (!isLoggedIn) {
      setStudySummary(null);
      return;
    }
    let alive = true;
    getStudySummary()
      .then((data) => {
        if (alive) setStudySummary(data);
      })
      .catch(() => {
        // 못 받아도 화면은 떠야 한다. 값 자리는 '—' 가 된다.
        if (alive) setStudySummary(null);
      });
    return () => {
      alive = false;
    };
  }, [isLoggedIn]);

  // 상위 랭킹도 비로그인에게 보인다. 기간을 바꾸면 다시 부른다.
  useEffect(() => {
    let alive = true;
    getRankingPreview(period as RankingPeriod)
      .then((data) => {
        if (alive) setTopRankings(data.rankings);
      })
      .catch(() => {
        // 못 받아도 홈은 떠야 한다. 목록이 비면 안내 문구로 내려간다.
        if (alive) setTopRankings([]);
      });
    return () => {
      alive = false;
    };
  }, [period]);

  // 공지·이벤트는 게시판 글이다. 관리자만 쓸 수 있어 목록이 자주 바뀌지 않는다.
  useEffect(() => {
    let alive = true;
    // 공지는 네 줄. 이벤트는 7일치를 거르려면 넉넉히 받아야 해서 10건을 받아 화면에서 자른다
    // (서버에 기간 필터가 없다).
    Promise.all([getHomeNotices(4), getHomeEvents(10)])
      .then(([noticePosts, eventPosts]) => {
        if (!alive) return;
        setNotices(
          noticePosts.map((post) => ({
            id: String(post.postId),
            category: '공지',
            title: post.title,
            author: post.authorNickname,
            createdAt: post.createdAt,
          })),
        );

        const toEvent = (post: (typeof eventPosts)[number]) => ({
          id: String(post.postId),
          title: post.title,
          // 본문 앞부분을 한 줄 설명으로 쓴다. 목록 응답이 이미 담아 준다.
          description: post.excerpt,
          createdAt: post.createdAt,
        });

        /*
         * 최근 7일치를 우선 보여 주되, 그 사이에 올라온 게 없으면 최신 5건으로 대신한다.
         *
         * 기간으로만 자르면 이벤트가 뜸한 주에 이 자리가 통째로 비는데, 홈에서 빈 칸은
         * "이 서비스는 이벤트를 안 한다"로 읽힌다. 대신 채웠다는 사실은 화면에 밝힌다.
         */
        const recent = eventPosts.filter(
          (post) => daysAgo(post.createdAt) < RECENT_EVENT_DAYS,
        );
        const usedFallback = recent.length === 0 && eventPosts.length > 0;
        setEventsFellBack(usedFallback);
        // 공지와 같은 목록이라 줄 수도 맞춘다. 한쪽만 길면 나란히 놓았을 때 어긋나 보인다.
        setEvents(
          (usedFallback ? eventPosts : recent).slice(0, 4).map(toEvent),
        );
      })
      .catch(() => {
        if (!alive) return;
        setNotices([]);
        setEvents([]);
        setEventsFellBack(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // 접속자 수는 비로그인 첫 화면의 핵심 숫자라 로그인 여부와 무관하게 부른다.
  useEffect(() => {
    let alive = true;
    getActiveUsers()
      .then((data) => {
        if (alive) setActiveUserCount(data.activeUserCount);
      })
      .catch(() => {
        if (alive) setActiveUserCount(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  // 방 찾기 목록 로드 (GET /study-rooms)
  useEffect(() => {
    let alive = true;
    getStudyRooms()
      .then((data) => {
        if (alive) setRooms(data);
      })
      .catch(() => {
        if (alive) setRooms([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  // 추천 카드는 서버가 관심 태그·활성 상태·정원·잠금 여부를 반영해 골라 준 방만 표시한다.
  useEffect(() => {
    if (!isLoggedIn) {
      return;
    }

    let alive = true;

    getRecommendedStudyRooms(3)
      .then((data) => {
        if (!alive) return;
        setRecommendedRooms(
          data.map((room) => ({
            id: String(room.roomId),
            title: room.title,
            meta: `${studyTagName(room.studyTagId)} · ${room.currentMembers} / ${room.maxMembers}명 참여 중`,
          })),
        );
      })
      .catch(() => {
        if (alive) {
          setRecommendedRooms([]);
          setRecommendationsError(true);
        }
      })
      .finally(() => {
        if (alive) setRecommendationsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [isLoggedIn, recommendationVersion]);

  /**
   * 스터디방 카드 클릭 → 상세 페이지.
   *
   * 예전에는 여기서 곧장 준비 화면 팝업을 열었다. 방 목록(스터디 방 찾기)에서는 카드를
   * 누르면 상세로 가는데 홈에서만 바로 입장해서, 같은 카드를 눌러도 결과가 달랐다.
   * 규칙·소개글·정원을 보고 들어갈지 정하는 게 자연스럽고, 잠긴 방 비밀번호도
   * 상세 페이지 한 곳에서만 받으면 된다.
   */
  function handleOpenRoomDetail(roomId: string) {
    navigate(`/study/${roomId}`);
  }

  /**
   * 추천 목록에서 바로 입장.
   *
   * 이쪽은 "바로 입장 가능한" 방만 모아 보여주는 자리라 상세를 거치지 않는다.
   *
   * 다만 추천 응답(RecommendedRoom)에는 잠금 여부가 없어서, 잠긴 방이 섞여 있어도
   * 비밀번호를 묻지 못한 채 준비 화면으로 넘어간다. 서버가 아직 비밀번호를 검사하지 않아
   * 지금은 차이가 없지만, 검증이 붙으면 추천 응답에도 isLocked 가 필요하다
   * (docs/backend/room-password.md 5번).
   *
   * 감지 동의를 철회했으면 막고 재동의를 안내한다. false 일 때만 막는다 —
   * null(아직 못 읽음)에서 막으면 서버가 잠깐 느린 것만으로 멀쩡한 사용자가
   * 방에 못 들어간다.
   */
  function handleEnterRoom(roomId: string) {
    if (detectionConsent.consented === false) {
      setConsentRequired(true);
      return;
    }
    openRoomWindowAt(roomId);
  }

  // 온보딩에서 목표를 정했으면 그 값을, 아니면 기본값을 쓴다.
  // 로그아웃하면 이전 사용자의 목표가 남지 않도록 로그인 상태일 때만 반영한다.
  const todayGoalMinutes =
    (isLoggedIn ? goalMinutes : null) ?? DEFAULT_GOAL_MINUTES;

  /** 오늘 공부한 시간(분). 서버는 초로 주므로 목표 시간과 단위를 맞춘다. 못 받았으면 0 이다. */
  const todayStudiedMinutes = Math.floor(
    (studySummary?.todayFocusedSeconds ?? 0) / 60,
  );
  const todayText = formatHourMinute(todayStudiedMinutes);

  /** 상단 카드에 돌려 보여줄 D-day. 캘린더에서 "D-day 표시하기"를 켠 일정들이다. */
  const exams: ExamCountdown[] = useMemo(() => {
    // 로그아웃하면 이전 사용자의 일정이 남지 않게 여기서 끊는다.
    if (!isLoggedIn) return [];
    return upcomingSchedules.map((schedule) => {
      const left = daysUntil(schedule.targetDate);
      return {
        id: schedule.scheduleId,
        badge: '다가오는 일정',
        title: schedule.title,
        dDayText: formatDDay(schedule.targetDate),
        // 메모를 적어 두었으면 그걸 보여준다. 시간·장소처럼 당일에 필요한 정보가 들어 있다.
        message:
          schedule.memo?.trim() ||
          (left === 0 ? '오늘이에요. 마무리 점검해요!' : `${left}일 남았어요.`),
      };
    });
  }, [isLoggedIn, upcomingSchedules]);

  /**
   * 상단 카드에 넘길 요약.
   *
   * 아직 못 받았으면 0 으로 둔다. 예전에는 그럴듯한 목업 숫자(12일째·21h 30m·남의 이름)를
   * 채워 놔서, 새로고침할 때마다 그 값이 잠깐 보였다가 진짜 값으로 바뀌었다. 자기 기록이
   * 바뀐 것처럼 읽힌다. 0 은 기록이 없는 사람이 실제로 보는 화면과 같아서 그런 오해가 없다.
   */
  const streakDays = studySummary?.streakDays ?? 0;
  const heroSummary: HomeSummary = {
    userName: member?.nickname ?? '',
    onlineCount: activeUserCount ?? 0,
    streakDays,
    streakNote:
      streakDays > 0 ? '오늘도 이어가고 있어요' : '오늘 시작해 보세요',
    weeklyStudyText: formatStudyTime(studySummary?.weekFocusedSeconds ?? 0),
    weeklyStudyNote: studySummary
      ? (formatWeekDiff(
          studySummary.weekDiffSeconds,
          studySummary.lastWeekFocusedSeconds,
        ) ?? '이번 주 첫 기록이에요')
      : '이번 주 첫 기록이에요',
  };

  return (
    <div className={styles['home-page']}>
      {/*
        비로그인 첫 화면은 신호등 히어로다. 본문 폭(1320)보다 넓게 깔려야 배경 도로가
        화면 끝까지 이어지므로 .home-inner 밖에 둔다.

        로그인한 사람에게는 안 보여준다 — 이미 쓰고 있는 사람에게 서비스 설명 화면을
        띄우면 오늘 할 일(목표·추천 방·랭킹)이 한 화면 아래로 밀린다.
      */}
      {!isLoggedIn && (
        <SignalHero
          onlineCount={activeUserCount ?? 0}
          howToId={HOW_IT_WORKS_ID}
        />
      )}

      <div className={styles['home-inner']}>
        {!isLoggedIn && <HowItWorksSection id={HOW_IT_WORKS_ID} />}

        <div className={styles['top-grid']}>
          <div className={styles['top-main']}>
            {/* 인사말·연속 학습·시험 D-day 는 개인 데이터라 비로그인에는 보이면 안 된다. */}
            {isLoggedIn && (
              <HeroSection
                summary={heroSummary}
                exams={exams}
                todayText={todayText}
                goalText={formatHourMinute(todayGoalMinutes)}
                onManageSchedule={() => navigate('/mypage/calendar')}
              />
            )}

            {/* 오늘의 목표·추천 스터디룸은 개인 맞춤 정보라 로그인해야 보인다.
                아래 StudyRoomFinder 는 맞춤 정보 없이도 방 목록 자체를 보여준다. */}
            {isLoggedIn && (
              <div className={styles['top-cards']}>
                <DailyGoalCard
                  studiedMinutes={todayStudiedMinutes}
                  goalMinutes={todayGoalMinutes}
                  canEditGoal={isLoggedIn}
                  onGoalSaved={setGoalMinutes}
                />
                <RecommendedRoomsCard
                  rooms={recommendedRooms}
                  loading={recommendationsLoading}
                  error={recommendationsError}
                  onEnter={handleEnterRoom}
                  onRetry={() => {
                    setRecommendationsLoading(true);
                    setRecommendationsError(false);
                    setRecommendationVersion((version) => version + 1);
                  }}
                />
              </div>
            )}
          </div>
        </div>

        <RankingSection
          period={period}
          onPeriodChange={setPeriod}
          updatedAt={rankingUpdatedAt}
          myRanking={isLoggedIn ? myRanking : null}
          topRankings={topRankings}
          isLoggedIn={isLoggedIn}
        />

        <StudyRoomFinder
          rooms={rooms}
          isLoggedIn={isLoggedIn}
          onCreateRoom={() => navigate('/study/create')}
          onEnterRoom={handleOpenRoomDetail}
          onRequireLogin={() => navigate('/login')}
        />

        {/*
          공지와 이벤트를 한 행에 둔다. 둘 다 "읽을 거리"라 성격이 같고, 각각 전체 폭을
          쓰면 페이지 끝이 늘어져 방 목록·랭킹만큼 중요한 것처럼 보인다.

          둘은 같은 목록 카드(HomePostList)를 쓰므로 폭도 반씩 나눈다. 한쪽을 넓히면
          같은 모양의 카드가 크기만 다른 셈이라 왜 다른지 찾게 된다.
        */}
        <div className={styles['news-grid']}>
          <NoticeSection notices={notices} />
          <EventSection events={events} fellBack={eventsFellBack} />
        </div>

        {consentRequired && (
          <ConsentRequiredDialog
            onGoToSettings={() => navigate('/mypage')}
            onCancel={() => {
              setConsentRequired(false);
              // 다른 탭에서 다시 동의하고 왔을 수 있다. 닫을 때 한 번 더 확인해 둔다.
              detectionConsent.refresh();
            }}
          />
        )}
      </div>
    </div>
  );
}
