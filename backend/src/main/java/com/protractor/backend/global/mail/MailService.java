package com.protractor.backend.global.mail;

import com.protractor.backend.global.exception.BusinessException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Slf4j
@Service
public class MailService {

    private final JavaMailSender mailSender;
    private final String fromAddress;

    public MailService(
            JavaMailSender mailSender,
            @Value("${spring.mail.username}") String fromAddress,
            @Value("${spring.mail.password}") String password
    ) {
        this.mailSender = mailSender;
        this.fromAddress = fromAddress;
        // 환경변수가 프로세스에 실제로 들어왔는지 기동 시점에 확인용. 비밀번호 값은 남기지 않는다.
        log.info("MailService 초기화: username='{}', password 길이={}자",
                fromAddress, password == null ? 0 : password.length());
    }

    public void sendVerificationCode(String to, String code) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(fromAddress);
        message.setTo(to);
        message.setSubject("[각잡고] 이메일 인증 코드");
        message.setText("""
                안녕하세요, 각잡고입니다.

                회원가입 이메일 인증 코드는 아래와 같습니다.

                인증 코드: %s

                이 코드는 5분간 유효합니다.
                본인이 요청하지 않았다면 이 메일을 무시해 주세요.
                """.formatted(code));

        try {
            mailSender.send(message);
        } catch (MailException e) {
            log.error("이메일 인증 코드 발송 실패: to={}", to, e);
            throw new BusinessException(HttpStatus.INTERNAL_SERVER_ERROR, "메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.");
        }
    }

    public void sendTempPassword(String to, String nickname, String tempPassword) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(fromAddress);
        message.setTo(to);
        message.setSubject("[각잡고] 임시 비밀번호 안내");
        message.setText("""
                안녕하세요, %s님.

                요청하신 임시 비밀번호는 아래와 같습니다.

                임시 비밀번호: %s

                로그인 후 [비밀번호 변경]에서 반드시 새 비밀번호로 변경해 주세요.
                본인이 요청하지 않았다면 이 메일을 무시해 주세요.
                """.formatted(nickname, tempPassword));

        try {
            mailSender.send(message);
        } catch (MailException e) {
            log.error("임시 비밀번호 메일 발송 실패: to={}", to, e);
            throw new BusinessException(HttpStatus.INTERNAL_SERVER_ERROR, "메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.");
        }
    }
}
