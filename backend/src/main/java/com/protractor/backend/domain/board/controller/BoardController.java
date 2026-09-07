package com.protractor.backend.domain.board.controller;

import com.protractor.backend.domain.board.dto.AttachmentDownload;
import com.protractor.backend.domain.board.dto.AttachmentResponse;
import com.protractor.backend.domain.board.dto.CommentCreateRequest;
import com.protractor.backend.domain.board.dto.CommentResponse;
import com.protractor.backend.domain.board.dto.PostCreateRequest;
import com.protractor.backend.domain.board.dto.PostCreateResponse;
import com.protractor.backend.domain.board.dto.PostDetailResponse;
import com.protractor.backend.domain.board.dto.PostListResponse;
import com.protractor.backend.domain.board.dto.PostUpdateRequest;
import com.protractor.backend.domain.board.entity.BoardCategory;
import com.protractor.backend.domain.board.service.BoardService;
import com.protractor.backend.domain.member.dto.MessageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * 커뮤니티 게시판·이벤트·1:1 문의 API.
 *
 * <p>
 * GET은 SecurityConfig에서 permitAll이라 비로그인도 호출된다 — 이때 Authentication 파라미터는
 * null로 들어오므로 {@link #currentMemberIdOrNull}로 감싸 읽는다. 쓰기(POST/PATCH/DELETE)는
 * 전부 인증 필수라 principal이 항상 있다.
 */
@Tag(name = "Board", description = "커뮤니티 게시판·공지·이벤트·1:1 문의 API")
@RestController
@RequestMapping("/api/v1/boards")
@RequiredArgsConstructor
public class BoardController {

    private final BoardService boardService;

    @Operation(summary = "게시글 목록", description = "category 생략 시 커뮤니티 전체(공지·자유·질문·자료공유). "
            + "INQUIRY는 로그인 필수이며 본인 문의만(관리자는 전체) 나온다. sort=latest|views|comments")
    @GetMapping("/posts")
    public ResponseEntity<PostListResponse> getPosts(
            Authentication authentication,
            @RequestParam(required = false) BoardCategory category,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "latest") String sort,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "6") int size
    ) {
        Long memberId = currentMemberIdOrNull(authentication);
        return ResponseEntity.ok(boardService.getPosts(memberId, category, keyword, sort, page, size));
    }

    @Operation(summary = "말머리별 게시글 수", description = "커뮤니티 탭 옆 숫자용. "
            + "키는 ALL·NOTICE·FREE·QNA·SHARE·EVENT. 1:1 문의는 본인 글만 보이는 규칙이라 포함하지 않는다.")
    @GetMapping("/posts/counts")
    public ResponseEntity<Map<String, Long>> getPostCounts() {
        return ResponseEntity.ok(boardService.getCategoryCounts());
    }

    @Operation(summary = "게시글 상세 (조회수 +1, 댓글·첨부 포함)")
    @GetMapping("/posts/{postId}")
    public ResponseEntity<PostDetailResponse> getPost(
            Authentication authentication,
            @PathVariable Long postId
    ) {
        return ResponseEntity.ok(boardService.getPost(currentMemberIdOrNull(authentication), postId));
    }

    @Operation(summary = "게시글 작성", description = "공지사항·이벤트는 관리자만 작성할 수 있다(403).")
    @PostMapping("/posts")
    public ResponseEntity<PostCreateResponse> createPost(
            Authentication authentication,
            @Valid @RequestBody PostCreateRequest request
    ) {
        Long memberId = (Long) authentication.getPrincipal();
        PostCreateResponse response = boardService.createPost(memberId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @Operation(summary = "게시글 수정 (보낸 필드만 반영, 작성자만)")
    @PatchMapping("/posts/{postId}")
    public ResponseEntity<PostDetailResponse> updatePost(
            Authentication authentication,
            @PathVariable Long postId,
            @Valid @RequestBody PostUpdateRequest request
    ) {
        Long memberId = (Long) authentication.getPrincipal();
        return ResponseEntity.ok(boardService.updatePost(memberId, postId, request));
    }

    @Operation(summary = "게시글 삭제 (작성자 또는 관리자, 소프트 삭제)")
    @DeleteMapping("/posts/{postId}")
    public ResponseEntity<MessageResponse> deletePost(
            Authentication authentication,
            @PathVariable Long postId
    ) {
        Long memberId = (Long) authentication.getPrincipal();
        boardService.deletePost(memberId, postId);
        return ResponseEntity.ok(new MessageResponse("게시글이 삭제되었습니다."));
    }

    @Operation(summary = "댓글 작성")
    @PostMapping("/posts/{postId}/comments")
    public ResponseEntity<CommentResponse> createComment(
            Authentication authentication,
            @PathVariable Long postId,
            @Valid @RequestBody CommentCreateRequest request
    ) {
        Long memberId = (Long) authentication.getPrincipal();
        CommentResponse response = boardService.createComment(memberId, postId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @Operation(summary = "댓글 삭제 (작성자 또는 관리자, 소프트 삭제)")
    @DeleteMapping("/comments/{commentId}")
    public ResponseEntity<MessageResponse> deleteComment(
            Authentication authentication,
            @PathVariable Long commentId
    ) {
        Long memberId = (Long) authentication.getPrincipal();
        boardService.deleteComment(memberId, commentId);
        return ResponseEntity.ok(new MessageResponse("댓글이 삭제되었습니다."));
    }

    @Operation(summary = "첨부파일 업로드", description = "게시글 작성자만. multipart 'files' 파트로 여러 개를 한 번에 올린다. "
            + "게시글당 최대 5개, 파일당 10MB.")
    @PostMapping("/posts/{postId}/attachments")
    public ResponseEntity<List<AttachmentResponse>> uploadAttachments(
            Authentication authentication,
            @PathVariable Long postId,
            @RequestPart("files") List<MultipartFile> files
    ) {
        Long memberId = (Long) authentication.getPrincipal();
        List<AttachmentResponse> response = boardService.uploadAttachments(memberId, postId, files);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @Operation(summary = "첨부파일 다운로드", description = "원본 파일명은 Content-Disposition과 "
            + "X-Attachment-Filename(URL 인코딩) 헤더로 내려간다. 실행 방지를 위해 항상 octet-stream으로 준다.")
    @GetMapping("/attachments/{attachmentId}/download")
    public ResponseEntity<Resource> downloadAttachment(
            Authentication authentication,
            @PathVariable Long attachmentId
    ) {
        AttachmentDownload download =
                boardService.downloadAttachment(currentMemberIdOrNull(authentication), attachmentId);
        String encodedName = URLEncoder.encode(download.originalName(), StandardCharsets.UTF_8)
                .replace("+", "%20");
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename*=UTF-8''" + encodedName)
                .header("X-Attachment-Filename", encodedName)
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .contentLength(download.fileSize())
                .body(download.resource());
    }

    /** permitAll GET에서 비로그인 요청은 Authentication이 null이다. */
    private Long currentMemberIdOrNull(Authentication authentication) {
        return authentication == null ? null : (Long) authentication.getPrincipal();
    }
}
