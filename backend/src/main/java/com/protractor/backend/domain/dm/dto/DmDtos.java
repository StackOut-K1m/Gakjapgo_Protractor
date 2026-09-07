package com.protractor.backend.domain.dm.dto;
import com.protractor.backend.domain.dm.entity.*; import jakarta.validation.constraints.*; import java.time.LocalDateTime; import java.util.List; import org.springframework.data.domain.Page;
public final class DmDtos { private DmDtos(){}
 public record OpenRequest(@NotNull @Positive Long memberId){} public record RoomResponse(Long roomId,Long memberId,String nickname,String profileImageUrl,String lastMessage,LocalDateTime lastMessageAt,long unreadCount){}
 public record SendRequest(@NotBlank @Size(max=2000) String content){} public record MessageResponse(Long messageId,Long senderMemberId,String content,LocalDateTime sentAt,LocalDateTime readAt){ public static MessageResponse from(DmMessage m){return new MessageResponse(m.getId(),m.getSenderMemberId(),m.getContent(),m.getCreatedAt(),m.getReadAt());}}
 public record MessageListResponse(List<MessageResponse> messages,PageInfo page){ public record PageInfo(int page,int size,long totalElements,int totalPages){} public static MessageListResponse from(Page<DmMessage> p){return new MessageListResponse(p.getContent().stream().map(MessageResponse::from).toList(),new PageInfo(p.getNumber(),p.getSize(),p.getTotalElements(),p.getTotalPages()));}}
}
