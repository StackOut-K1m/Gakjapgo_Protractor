package com.protractor.backend.domain.board.service;

import com.protractor.backend.domain.board.dto.AttachmentDownload;
import com.protractor.backend.domain.board.dto.AttachmentResponse;
import com.protractor.backend.domain.board.dto.CommentCreateRequest;
import com.protractor.backend.domain.board.dto.CommentResponse;
import com.protractor.backend.domain.board.dto.CommentRow;
import com.protractor.backend.domain.board.dto.PostCreateRequest;
import com.protractor.backend.domain.board.dto.PostCreateResponse;
import com.protractor.backend.domain.board.dto.PostDetailResponse;
import com.protractor.backend.domain.board.dto.PostListResponse;
import com.protractor.backend.domain.board.dto.PostSummaryRow;
import com.protractor.backend.domain.board.dto.PostUpdateRequest;
import com.protractor.backend.domain.board.entity.BoardCategory;
import com.protractor.backend.domain.board.entity.Comment;
import com.protractor.backend.domain.board.entity.Post;
import com.protractor.backend.domain.board.entity.PostAttachment;
import com.protractor.backend.domain.board.repository.CommentRepository;
import com.protractor.backend.domain.board.repository.PostAttachmentRepository;
import com.protractor.backend.domain.board.repository.PostRepository;
import com.protractor.backend.domain.member.entity.Member;
import com.protractor.backend.domain.member.entity.Role;
import com.protractor.backend.domain.member.repository.MemberRepository;
import com.protractor.backend.global.exception.BusinessException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

/**
 * 커뮤니티 게시판(공지·자유·질문·자료공유) + 이벤트 + 1:1 문의.
 *
 * <p>규칙 요약
 * <ul>
 * <li>조회(GET)는 비로그인도 가능하다. 단 1:1 문의(INQUIRY)는 작성자 본인과 관리자만 본다 —
 *     남의 문의는 존재를 숨기려 404로 답한다(남의 일정 404와 같은 관례).</li>
 * <li>공지(NOTICE)·이벤트(EVENT) 작성은 관리자(Role.ADMIN)만 가능하다. 관리자 승격은 아직
 *     화면이 없어 DB에서 role을 바꿔 준다(팀 협의 대상).</li>
 * <li>삭제는 전부 소프트 삭제. 수정은 작성자만, 삭제는 작성자 또는 관리자.</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class BoardService {

    private static final int MAX_ATTACHMENT_COUNT = 5;
    private static final long MAX_ATTACHMENT_SIZE_BYTES = 10L * 1024 * 1024; // 10MB (yml multipart 제한과 동일)
    private static final int MAX_ORIGINAL_NAME_LENGTH = 255;

    private final PostRepository postRepository;
    private final CommentRepository commentRepository;
    private final PostAttachmentRepository postAttachmentRepository;
    private final MemberRepository memberRepository;
    private final PostAttachmentStorage attachmentStorage;

    /**
     * 첨부 기능을 열어 둘지.
     *
     * 두 가지가 갖춰져야 켤 수 있다 — 첨부 메타데이터를 남길 {@code post_attachments} 테이블과,
     * 실물 파일이 재시작에도 남을 저장 경로(도커 볼륨). 둘 중 하나라도 없으면 켜 두는 것이 더
     * 나쁘다. 테이블이 없으면 상세 조회가 통째로 실패하고, 볼륨이 없으면 DB에는 첨부가 있다고
     * 적혀 있는데 실물이 사라져 다운로드가 깨진다.
     *
     * 준비되면 {@code app.board.attachments-enabled=true} 로 켠다. 프론트의 첨부 버튼 잠금과
     * 짝이라 같이 풀어야 한다.
     */
    @Value("${app.board.attachments-enabled:false}")
    private boolean attachmentsEnabled;

    public PostListResponse getPosts(Long memberId, BoardCategory category, String keyword,
                                     String sort, int page, int size) {
        List<BoardCategory> categories;
        Long authorId = null;
        if (category == BoardCategory.INQUIRY) {
            // 문의함은 로그인 필수. 일반 회원은 내 문의만, 관리자는 전체 문의를 본다.
            if (memberId == null) {
                throw new BusinessException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다.");
            }
            categories = List.of(BoardCategory.INQUIRY);
            if (!isAdmin(memberId)) {
                authorId = memberId;
            }
        } else if (category != null) {
            categories = List.of(category);
        } else {
            categories = BoardCategory.communityCategories();
        }

        String trimmedKeyword = StringUtils.hasText(keyword) ? keyword.trim() : null;
        Pageable pageable = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 50));

        Page<PostSummaryRow> result = switch (sort == null ? "latest" : sort) {
            case "views" -> postRepository.findPageOrderByViews(categories, trimmedKeyword, authorId, pageable);
            case "comments" -> postRepository.findPageOrderByComments(categories, trimmedKeyword, authorId, pageable);
            default -> postRepository.findPageOrderByLatest(categories, trimmedKeyword, authorId, pageable);
        };
        return PostListResponse.from(result);
    }

    /**
     * 커뮤니티 탭 옆에 붙는 말머리별 글 수.
     *
     * <p>
     * 화면이 탭마다 목록을 한 번씩 더 부르지 않도록 한 번에 내려준다. 1:1 문의(INQUIRY)는
     * 커뮤니티 탭이 아니고 본인 글만 보이는 규칙이라 여기 넣지 않는다 — 남의 문의 수까지
     * 세어 흘리게 된다.
     *
     * <p>
     * "ALL"은 커뮤니티 전체 탭(공지·자유·질문·자료공유)의 합이다. 이벤트는 그 탭에 들어가지
     * 않으므로 합에서도 뺀다 — 목록과 숫자가 달라진다.
     */
    public Map<String, Long> getCategoryCounts() {
        List<BoardCategory> targets = new ArrayList<>(BoardCategory.communityCategories());
        targets.add(BoardCategory.EVENT);

        Map<String, Long> counts = new LinkedHashMap<>();
        targets.forEach(category -> counts.put(category.name(), 0L));
        postRepository.countByCategory(targets)
                .forEach(row -> counts.put(row.category().name(), row.count()));

        long all = BoardCategory.communityCategories().stream()
                .mapToLong(category -> counts.getOrDefault(category.name(), 0L))
                .sum();
        counts.put("ALL", all);
        return counts;
    }

    /** 상세 조회. 접근 가능하면 조회수를 1 올리고, 올라간 값으로 응답한다. */
    @Transactional
    public PostDetailResponse getPost(Long memberId, Long postId) {
        Post post = findVisiblePost(postId);
        assertReadable(post, memberId);
        postRepository.incrementViewCount(postId);
        return buildDetail(post, memberId, post.getViewCount() + 1);
    }

    @Transactional
    public PostCreateResponse createPost(Long memberId, PostCreateRequest request) {
        assertWritable(request.category(), memberId);
        Post post = Post.builder()
                .authorMemberId(memberId)
                .category(request.category())
                .title(request.title().trim())
                .content(request.content().trim())
                .build();
        return PostCreateResponse.from(postRepository.save(post));
    }

    /** 부분 수정(보낸 필드만 반영). 작성자만 가능하다. */
    @Transactional
    public PostDetailResponse updatePost(Long memberId, Long postId, PostUpdateRequest request) {
        Post post = findVisiblePost(postId);
        assertReadable(post, memberId);
        if (!post.isOwnedBy(memberId)) {
            throw new BusinessException(HttpStatus.FORBIDDEN, "작성자만 수정할 수 있습니다.");
        }
        if (request.category() != null && request.category() != post.getCategory()) {
            // 문의 글은 비공개 게시판이라 다른 게시판으로 옮기거나 옮겨 올 수 없다.
            if (post.getCategory() == BoardCategory.INQUIRY || request.category() == BoardCategory.INQUIRY) {
                throw new BusinessException(HttpStatus.BAD_REQUEST, "문의 글의 게시판은 변경할 수 없습니다.");
            }
            assertWritable(request.category(), memberId);
            post.changeCategory(request.category());
        }
        if (request.title() != null) {
            if (request.title().isBlank()) {
                throw new BusinessException(HttpStatus.BAD_REQUEST, "제목을 입력해주세요.");
            }
            post.changeTitle(request.title().trim());
        }
        if (request.content() != null) {
            if (request.content().isBlank()) {
                throw new BusinessException(HttpStatus.BAD_REQUEST, "내용을 입력해주세요.");
            }
            post.changeContent(request.content().trim());
        }
        return buildDetail(post, memberId, post.getViewCount());
    }

    /** 작성자 또는 관리자만. deleted_at을 채우는 소프트 삭제라 데이터는 남는다. */
    @Transactional
    public void deletePost(Long memberId, Long postId) {
        Post post = findVisiblePost(postId);
        assertReadable(post, memberId);
        if (!post.isOwnedBy(memberId) && !isAdmin(memberId)) {
            throw new BusinessException(HttpStatus.FORBIDDEN, "작성자 또는 관리자만 삭제할 수 있습니다.");
        }
        post.softDelete();
    }

    @Transactional
    public CommentResponse createComment(Long memberId, Long postId, CommentCreateRequest request) {
        Post post = findVisiblePost(postId);
        // 문의 글 댓글은 문의 당사자와 관리자(답변)만 달 수 있다 — 조회 규칙과 동일.
        assertReadable(post, memberId);
        Comment comment = commentRepository.save(Comment.builder()
                .postId(post.getId())
                .authorMemberId(memberId)
                .content(request.content().trim())
                .build());
        String nickname = memberRepository.findById(memberId)
                .map(Member::getNickname)
                .orElse("알 수 없음");
        return new CommentResponse(comment.getId(), nickname, comment.getContent(), comment.getCreatedAt(), true);
    }

    @Transactional
    public void deleteComment(Long memberId, Long commentId) {
        Comment comment = commentRepository.findByIdAndDeletedAtIsNull(commentId)
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "댓글을 찾을 수 없습니다."));
        if (!comment.isOwnedBy(memberId) && !isAdmin(memberId)) {
            throw new BusinessException(HttpStatus.FORBIDDEN, "작성자 또는 관리자만 삭제할 수 있습니다.");
        }
        comment.softDelete();
    }

    /**
     * 첨부 기능이 꺼져 있으면 여기서 끊는다.
     *
     * 화면에서도 첨부 버튼을 잠가 두지만 그것은 안내일 뿐이다. API를 직접 부르면 그 화면을
     * 거치지 않으므로 실제로 막는 곳은 여기여야 한다. 상태코드를 503으로 두는 것은 요청이
     * 잘못된 것이 아니라 서버 쪽 준비가 안 된 것이기 때문이다.
     */
    private void assertAttachmentsEnabled() {
        if (!attachmentsEnabled) {
            throw new BusinessException(HttpStatus.SERVICE_UNAVAILABLE, "첨부파일 기능은 준비 중입니다.");
        }
    }

    /** 첨부 업로드. 게시글 작성자만, 게시글당 최대 5개·파일당 10MB. */
    @Transactional
    public List<AttachmentResponse> uploadAttachments(Long memberId, Long postId, List<MultipartFile> files) {
        assertAttachmentsEnabled();
        Post post = findVisiblePost(postId);
        if (!post.isOwnedBy(memberId)) {
            throw new BusinessException(HttpStatus.FORBIDDEN, "게시글 작성자만 파일을 첨부할 수 있습니다.");
        }
        if (files == null || files.isEmpty()) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "첨부할 파일이 없습니다.");
        }
        long existing = postAttachmentRepository.countByPostId(postId);
        if (existing + files.size() > MAX_ATTACHMENT_COUNT) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "첨부파일은 게시글당 최대 " + MAX_ATTACHMENT_COUNT + "개입니다.");
        }
        for (MultipartFile file : files) {
            if (file.isEmpty()) {
                throw new BusinessException(HttpStatus.BAD_REQUEST, "빈 파일은 첨부할 수 없습니다.");
            }
            if (file.getSize() > MAX_ATTACHMENT_SIZE_BYTES) {
                throw new BusinessException(HttpStatus.BAD_REQUEST, "파일 하나당 10MB 이하만 첨부할 수 있습니다.");
            }
        }
        // 검증을 모두 통과한 뒤에 실제 저장한다. (저장 중 IOException이 나면 이미 쓴 파일이
        // 디스크에 남을 수 있지만, DB 행이 없으면 노출되지 않는 고아 파일이라 그대로 둔다.)
        List<PostAttachment> saved = files.stream()
                .map(file -> {
                    String storedName = attachmentStorage.store(file);
                    return postAttachmentRepository.save(PostAttachment.builder()
                            .postId(postId)
                            .originalName(sanitizeOriginalName(file.getOriginalFilename()))
                            .storedName(storedName)
                            .contentType(file.getContentType())
                            .fileSize(file.getSize())
                            .build());
                })
                .toList();
        return saved.stream().map(AttachmentResponse::from).toList();
    }

    public AttachmentDownload downloadAttachment(Long memberId, Long attachmentId) {
        assertAttachmentsEnabled();
        PostAttachment attachment = postAttachmentRepository.findById(attachmentId)
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "첨부파일을 찾을 수 없습니다."));
        Post post = postRepository.findByIdAndDeletedAtIsNull(attachment.getPostId())
                .filter(Post::isVisible)
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "게시글을 찾을 수 없습니다."));
        assertReadable(post, memberId);
        return new AttachmentDownload(
                attachmentStorage.load(attachment.getStoredName()),
                attachment.getOriginalName(),
                attachment.getContentType(),
                attachment.getFileSize()
        );
    }

    // ── 내부 규칙 ─────────────────────────────────────────────

    private Post findVisiblePost(Long postId) {
        return postRepository.findByIdAndDeletedAtIsNull(postId)
                .filter(Post::isVisible)
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "게시글을 찾을 수 없습니다."));
    }

    /** 문의 글 접근 제한. 나머지 카테고리는 비로그인 포함 전체 공개라 아무것도 하지 않는다. */
    private void assertReadable(Post post, Long memberId) {
        if (post.getCategory() != BoardCategory.INQUIRY) {
            return;
        }
        if (memberId == null) {
            throw new BusinessException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다.");
        }
        if (!post.isOwnedBy(memberId) && !isAdmin(memberId)) {
            // 남의 문의는 존재 자체를 숨긴다.
            throw new BusinessException(HttpStatus.NOT_FOUND, "게시글을 찾을 수 없습니다.");
        }
    }

    private void assertWritable(BoardCategory category, Long memberId) {
        if ((category == BoardCategory.NOTICE || category == BoardCategory.EVENT) && !isAdmin(memberId)) {
            throw new BusinessException(HttpStatus.FORBIDDEN, "공지사항·이벤트 글은 관리자만 작성할 수 있습니다.");
        }
    }

    private boolean isAdmin(Long memberId) {
        return memberId != null && memberRepository.findById(memberId)
                .map(member -> member.getRole() == Role.ADMIN)
                .orElse(false);
    }

    private PostDetailResponse buildDetail(Post post, Long memberId, int viewCount) {
        String authorNickname = memberRepository.findById(post.getAuthorMemberId())
                .map(Member::getNickname)
                .orElse("알 수 없음");
        // 첨부 기능이 꺼져 있으면 조회 자체를 하지 않는다. 첨부가 0개인 글도 이 쿼리는 나가므로,
        // 저장할 곳이 아직 없는 환경에서는 모든 상세 조회가 실패한다(글은 멀쩡히 있는데 못 연다).
        List<AttachmentResponse> attachments = attachmentsEnabled
                ? postAttachmentRepository.findByPostIdOrderByIdAsc(post.getId())
                        .stream()
                        .map(AttachmentResponse::from)
                        .toList()
                : List.of();
        List<CommentRow> rows = commentRepository.findRowsByPostId(post.getId());
        List<CommentResponse> comments = rows.stream()
                .map(row -> CommentResponse.of(row, memberId))
                .toList();
        boolean mine = memberId != null && post.isOwnedBy(memberId);
        return new PostDetailResponse(
                post.getId(),
                post.getCategory(),
                post.getTitle(),
                post.getContent(),
                authorNickname,
                mine,
                post.getCreatedAt(),
                post.getUpdatedAt(),
                viewCount,
                comments.size(),
                attachments,
                comments
        );
    }

    private String sanitizeOriginalName(String originalName) {
        if (!StringUtils.hasText(originalName)) {
            return "attachment";
        }
        // 브라우저·OS에 따라 경로가 섞여 올 수 있어 마지막 구분자 뒤 이름만 남긴다.
        String name = originalName.substring(Math.max(
                originalName.lastIndexOf('/'), originalName.lastIndexOf('\\')) + 1);
        if (name.isBlank()) {
            return "attachment";
        }
        return name.length() > MAX_ORIGINAL_NAME_LENGTH ? name.substring(0, MAX_ORIGINAL_NAME_LENGTH) : name;
    }
}
