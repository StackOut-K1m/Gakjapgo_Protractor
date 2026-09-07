package com.protractor.backend.global.exception;

import jakarta.validation.ConstraintViolationException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ErrorResponse> handleBusinessException(BusinessException e) {
        return ResponseEntity
                .status(e.getStatus())
                .body(ErrorResponse.of(e.getStatus().value(), e.getMessage()));
    }

    // 다른 도메인(캘리브레이션 등)이 쓰는 ResponseStatusException은 상태코드와 안내 문구를 그대로 보존한다.
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ErrorResponse> handleResponseStatusException(ResponseStatusException e) {
        return ResponseEntity
                .status(e.getStatusCode())
                .body(ErrorResponse.of(e.getStatusCode().value(), e.getReason()));
    }

    // 잘못된 JSON 본문(400), 파라미터 타입 불일치(400), 미지원 메서드(405), 없는 경로(404) 등
    // Spring MVC가 던지는 예외는 전부 부모 클래스가 받아 이 메서드로 모인다.
    // 원래 상태코드를 유지한 채 응답 형식만 우리 ErrorResponse로 통일한다.
    // (이 상속이 없으면 아래 포괄 Exception 핸들러가 가로채 전부 500이 된다)
    @Override
    protected ResponseEntity<Object> handleExceptionInternal(
            Exception ex, Object body, HttpHeaders headers, HttpStatusCode statusCode, WebRequest request) {
        return ResponseEntity
                .status(statusCode)
                .headers(headers)
                .body(ErrorResponse.of(statusCode.value(), defaultMessage(statusCode)));
    }

    // @Valid 실패는 필드에 적어 둔 안내 문구를 그대로 내보내기 위해 별도 처리한다.
    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(
            MethodArgumentNotValidException e, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        String message = e.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(fieldError -> fieldError.getDefaultMessage())
                .orElse("잘못된 요청입니다.");
        return ResponseEntity
                .badRequest()
                .body(ErrorResponse.of(HttpStatus.BAD_REQUEST.value(), message));
    }

    // DB 제약 위반(UNIQUE 중복, FK 위반, CHECK 위반 등). 포괄 Exception 핸들러가 500으로 삼키지 않도록 409로 명시한다.
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ErrorResponse> handleDataIntegrityViolation(DataIntegrityViolationException e) {
        log.warn("Data integrity violation", e);
        return ResponseEntity
                .status(HttpStatus.CONFLICT)
                .body(ErrorResponse.of(HttpStatus.CONFLICT.value(), "요청이 데이터 제약 조건에 어긋납니다."));
    }

    // @Validated가 붙은 경로/쿼리 파라미터 검증 실패는 400으로 처리한다(@Valid 본문 검증과 별개).
    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ErrorResponse> handleConstraintViolation(ConstraintViolationException e) {
        String message = e.getConstraintViolations().stream()
                .findFirst()
                .map(violation -> violation.getMessage())
                .orElse("잘못된 요청입니다.");
        return ResponseEntity
                .badRequest()
                .body(ErrorResponse.of(HttpStatus.BAD_REQUEST.value(), message));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleException(Exception e) {
        log.error("Unhandled exception", e);
        return ResponseEntity
                .internalServerError()
                .body(ErrorResponse.of(HttpStatus.INTERNAL_SERVER_ERROR.value(), "서버 오류가 발생했습니다."));
    }

    private String defaultMessage(HttpStatusCode statusCode) {
        return switch (statusCode.value()) {
            case 404 -> "요청한 경로를 찾을 수 없습니다.";
            case 405 -> "지원하지 않는 HTTP 메서드입니다.";
            // 게시판 첨부 등 multipart 용량 초과(MaxUploadSizeExceededException)도 부모 클래스가 여기로 모은다.
            case 413 -> "업로드 용량 제한을 초과했습니다. (파일당 10MB)";
            case 415 -> "지원하지 않는 요청 형식입니다.";
            default -> statusCode.is4xxClientError() ? "잘못된 요청입니다." : "서버 오류가 발생했습니다.";
        };
    }
}
