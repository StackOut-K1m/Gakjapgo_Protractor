package com.protractor.backend.domain.onboarding.service;

import com.protractor.backend.domain.onboarding.dto.OnboardingMeResponse;
import com.protractor.backend.domain.onboarding.dto.OnboardingOptionsResponse;
import com.protractor.backend.domain.onboarding.dto.OnboardingOptionsResponse.ConsentItemResponse;
import com.protractor.backend.domain.onboarding.dto.OnboardingSaveRequest;
import com.protractor.backend.domain.onboarding.dto.OnboardingSaveResponse;
import com.protractor.backend.domain.onboarding.dto.OnboardingUpdateRequest;
import com.protractor.backend.domain.onboarding.dto.OnboardingUpdateResponse;
import com.protractor.backend.domain.onboarding.entity.MemberPreference;
import com.protractor.backend.domain.onboarding.entity.MemberPurpose;
import com.protractor.backend.domain.onboarding.repository.MemberPreferenceRepository;
import com.protractor.backend.domain.onboarding.repository.MemberPurposeRepository;
import com.protractor.backend.domain.studytag.dto.StudyTagResponse;
import com.protractor.backend.domain.studytag.entity.MemberStudyTag;
import com.protractor.backend.domain.studytag.entity.StudyTag;
import com.protractor.backend.domain.studytag.repository.MemberStudyTagRepository;
import com.protractor.backend.domain.studytag.repository.StudyTagRepository;
import com.protractor.backend.global.exception.BusinessException;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 온보딩(첫 로그인 설정) 처리. 공부 목적(다중)·학습 목표·관심 태그·AI 감지 동의를 받아 저장한다.
 *
 * <p>
 * 화면 시안 기준: 1단계 목적과 3단계 관심 채널의 선택지는 같은 고정 목록(study_tags의 활성 태그 이름)을 쓴다.
 * 목적은 문자열로 member_purposes에, 관심 채널은 태그 ID로 member_study_tags에 저장된다.
 *
 * <p>
 * 저장은 POST 1회가 원칙이고(이미 완료면 409), 이후 변경은 목적·목표·태그·동의 모두 PATCH로 한다.
 * 감지 동의 2종(자세·졸음)은 가입 시 필수이며 철회도 불가하다(DTO의 @AssertTrue가 거절).
 * 캡처 동의만 false로 철회할 수 있고, 변경 시각(consent_updated_at)이 함께 남는다.
 */
@Service
@RequiredArgsConstructor
public class OnboardingService {

    /** key는 온보딩 저장 요청의 동의 필드명과 1:1로 맞춘다. */
    private static final List<ConsentItemResponse> CONSENT_ITEMS = List.of(
            new ConsentItemResponse(
                    "postureDetectionConsent",
                    "자세 감지",
                    "학습 중 웹캠으로 자세를 실시간 분석하는 것에 동의합니다."),
            new ConsentItemResponse(
                    "drowsinessDetectionConsent",
                    "졸음 감지",
                    "학습 중 웹캠으로 졸음 상태를 감지하는 것에 동의합니다."),
            new ConsentItemResponse(
                    "postureCaptureConsent",
                    "자세 캡처 저장",
                    "잘못된 자세가 감지된 순간의 캡처 이미지를 학습 기록에 저장하는 것에 동의합니다.")
    );

    private final MemberPreferenceRepository memberPreferenceRepository;
    private final MemberPurposeRepository memberPurposeRepository;
    private final StudyTagRepository studyTagRepository;
    private final MemberStudyTagRepository memberStudyTagRepository;

    @Transactional(readOnly = true)
    public OnboardingOptionsResponse getOptions() {
        List<StudyTag> tags = studyTagRepository.findAllByEnabledTrueOrderByIdAsc();
        // 목적(1단계)과 관심 채널(3단계)은 같은 목록을 쓰기로 한 기획 결정. 목적은 이름만 내려준다.
        List<String> purposes = tags.stream().map(StudyTag::getName).toList();
        return new OnboardingOptionsResponse(purposes, StudyTagResponse.listFrom(tags), CONSENT_ITEMS);
    }

    @Transactional
    public OnboardingSaveResponse save(Long memberId, OnboardingSaveRequest request) {
        Set<String> purposes = validatePurposes(request.purposes(), Set.of());
        Set<Long> tagIds = validateTagIds(request.tagIds(), Set.of());
        // 화면(4단계)에 캡처 동의 항목이 아직 없어 선택 필드다. 미전송은 미동의로 본다.
        boolean captureConsent = Boolean.TRUE.equals(request.postureCaptureConsent());

        MemberPreference preference = memberPreferenceRepository.findById(memberId)
                .map(existing -> {
                    // 행이 있어도 완료 전(다른 기능이 동의만 먼저 저장한 경우)이라면 온보딩으로 채운다.
                    if (existing.isOnboardingCompleted()) {
                        throw new BusinessException(HttpStatus.CONFLICT,
                                "이미 온보딩을 완료했습니다. 변경은 온보딩 수정 API를 이용해주세요.");
                    }
                    existing.completeOnboarding(normalizeGoalText(request.goalText()),
                            request.goalMinutes(),
                            request.postureDetectionConsent(), request.drowsinessDetectionConsent(),
                            captureConsent);
                    return existing;
                })
                .orElseGet(() -> insertNewPreference(memberId, request, captureConsent));

        replacePurposes(memberId, purposes);
        replaceTags(memberId, tagIds);
        return OnboardingSaveResponse.from(preference);
    }

    /**
     * 신규 행 저장. 같은 회원이 동시에 두 번 저장하면(더블클릭 등) 늦은 쪽이 PK 충돌하는데,
     * 이는 중복 저장과 같은 상황이므로 500 대신 409로 알린다. flush를 강제해 충돌을 이 자리에서 감지한다
     * (지연되면 커밋 시점에 터져서 잡을 수 없다).
     */
    private MemberPreference insertNewPreference(Long memberId, OnboardingSaveRequest request,
                                                 boolean captureConsent) {
        try {
            return memberPreferenceRepository.saveAndFlush(MemberPreference.builder()
                    .memberId(memberId)
                    .goalText(normalizeGoalText(request.goalText()))
                    .goalMinutes(request.goalMinutes())
                    .postureDetectionConsent(request.postureDetectionConsent())
                    .drowsinessDetectionConsent(request.drowsinessDetectionConsent())
                    .postureCaptureConsent(captureConsent)
                    .build());
        } catch (DataIntegrityViolationException e) {
            throw new BusinessException(HttpStatus.CONFLICT,
                    "이미 온보딩을 완료했습니다. 변경은 온보딩 수정 API를 이용해주세요.");
        }
    }

    @Transactional(readOnly = true)
    public OnboardingMeResponse getMe(Long memberId) {
        MemberPreference preference = findOrThrow(memberId);
        List<String> purposes = memberPurposeRepository.findPurposesByMemberId(memberId);
        List<StudyTag> tags = memberStudyTagRepository.findTagsByMemberId(memberId);
        return OnboardingMeResponse.of(preference, purposes, tags);
    }

    @Transactional
    public OnboardingUpdateResponse update(Long memberId, OnboardingUpdateRequest request) {
        if (request.hasNoChanges()) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "수정할 내용이 없습니다.");
        }

        MemberPreference preference = findOrThrow(memberId);

        if (request.purposes() != null) {
            // 이미 보유한 목적은 (태그가 비활성화됐어도) 재전송을 허용해야 기존 회원의 수정이 막히지 않는다.
            // 주의: 반드시 스칼라 조회로 가져온다. 엔티티 조회면 아래 교체(벌크 삭제→재삽입)에서 행이 유실된다.
            Set<String> owned = new HashSet<>(memberPurposeRepository.findPurposesByMemberId(memberId));
            replacePurposes(memberId, validatePurposes(request.purposes(), owned));
        }
        if (request.goalText() != null) {
            // 빈 문자열은 "목표 지우기"로 취급한다.
            preference.changeGoalText(normalizeGoalText(request.goalText()));
        }
        if (request.goalMinutes() != null) {
            // 0은 "목표 시간 해제"다.
            preference.changeGoalMinutes(
                    request.goalMinutes() == 0 ? null : request.goalMinutes());
        }
        if (request.tagIds() != null) {
            Set<Long> ownedTagIds = memberStudyTagRepository.findTagsByMemberId(memberId).stream()
                    .map(StudyTag::getId)
                    .collect(Collectors.toSet());
            replaceTags(memberId, validateTagIds(request.tagIds(), ownedTagIds));
        }
        if (request.hasConsentChange()) {
            // 안 보낸 항목은 기존 값을 유지한다. false를 보내면 철회다.
            preference.changeConsents(
                    resolve(request.postureDetectionConsent(), preference.isPostureDetectionConsent()),
                    resolve(request.drowsinessDetectionConsent(), preference.isDrowsinessDetectionConsent()),
                    resolve(request.postureCaptureConsent(), preference.isPostureCaptureConsent()));
        }

        preference.markUpdated();
        return OnboardingUpdateResponse.from(preference);
    }

    private MemberPreference findOrThrow(Long memberId) {
        return memberPreferenceRepository.findById(memberId)
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND,
                        "온보딩 정보가 없습니다. 온보딩을 먼저 완료해주세요."));
    }

    /**
     * 중복을 제거하고 전부 고를 수 있는 값인지 확인한다. 빈 선택은 허용하지 않는다(목적은 필수).
     * 허용 범위 = 활성 태그 이름 + 이미 보유한 목적. 신규 선택만 활성 목록으로 제한되므로,
     * 태그를 비활성화해도 그 값을 이미 가진 회원의 수정 요청이 깨지지 않는다.
     */
    private Set<String> validatePurposes(List<String> purposes, Set<String> alreadyOwned) {
        if (purposes == null || purposes.isEmpty()) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "공부 목적은 1개 이상 선택해야 합니다.");
        }
        Set<String> unique = new LinkedHashSet<>(purposes);
        Set<String> allowed = studyTagRepository.findAllByEnabledTrueOrderByIdAsc().stream()
                .map(StudyTag::getName)
                .collect(Collectors.toCollection(HashSet::new));
        allowed.addAll(alreadyOwned);
        if (!allowed.containsAll(unique)) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "공부 목적은 온보딩 선택지 중에서만 고를 수 있습니다.");
        }
        return unique;
    }

    /** 허용 범위 = 활성 태그 + 이미 보유한 태그(비활성화됐어도 유지·재전송 가능). */
    private Set<Long> validateTagIds(List<Long> tagIds, Set<Long> alreadyOwned) {
        if (tagIds == null || tagIds.isEmpty()) {
            return Set.of();
        }
        Set<Long> unique = new LinkedHashSet<>(tagIds);
        Set<Long> allowed = studyTagRepository.findAllByIdInAndEnabledTrue(unique).stream()
                .map(StudyTag::getId)
                .collect(Collectors.toCollection(HashSet::new));
        allowed.addAll(alreadyOwned);
        if (!allowed.containsAll(unique)) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "존재하지 않거나 사용할 수 없는 태그가 포함되어 있습니다.");
        }
        return unique;
    }

    /** 회원 목적을 통째로 교체한다. 요청 자체가 "최종 선택 목록"이라 부분 추가/삭제보다 의미가 맞다. */
    private void replacePurposes(Long memberId, Set<String> purposes) {
        memberPurposeRepository.deleteAllByMemberId(memberId);
        List<MemberPurpose> rows = purposes.stream()
                .map(purpose -> new MemberPurpose(memberId, purpose))
                .toList();
        memberPurposeRepository.saveAll(rows);
    }

    /** 회원 태그를 통째로 교체한다. */
    private void replaceTags(Long memberId, Set<Long> tagIds) {
        memberStudyTagRepository.deleteAllByMemberId(memberId);
        List<MemberStudyTag> rows = tagIds.stream()
                .map(tagId -> new MemberStudyTag(memberId, tagId))
                .toList();
        memberStudyTagRepository.saveAll(rows);
    }

    private boolean resolve(Boolean requested, boolean current) {
        return requested != null ? requested : current;
    }

    private String normalizeGoalText(String goalText) {
        if (goalText == null || goalText.isBlank()) {
            return null;
        }
        return goalText.trim();
    }
}
