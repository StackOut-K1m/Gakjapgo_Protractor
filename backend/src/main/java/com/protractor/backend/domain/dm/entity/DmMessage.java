package com.protractor.backend.domain.dm.entity;
import jakarta.persistence.*; import java.time.LocalDateTime; import lombok.*;
@Entity @Table(name="dm_messages") @Getter @NoArgsConstructor(access=AccessLevel.PROTECTED)
public class DmMessage {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) @Column(name="dm_message_id") private Long id;
 @Column(name="dm_room_id",nullable=false) private Long dmRoomId; @Column(name="sender_member_id",nullable=false) private Long senderMemberId;
 @Column(name="content",nullable=false,columnDefinition="TEXT") private String content; @Column(name="read_at") private LocalDateTime readAt; @Column(name="created_at",nullable=false,updatable=false) private LocalDateTime createdAt;
 private DmMessage(Long roomId,Long sender,String content){dmRoomId=roomId;senderMemberId=sender;this.content=content;}
 public static DmMessage of(Long roomId,Long sender,String content){return new DmMessage(roomId,sender,content);}
 public void markRead(){if(readAt==null)readAt=LocalDateTime.now();} @PrePersist void create(){createdAt=LocalDateTime.now();}
}
