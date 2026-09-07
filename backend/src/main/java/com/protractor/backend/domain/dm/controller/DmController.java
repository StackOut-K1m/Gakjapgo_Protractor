package com.protractor.backend.domain.dm.controller;
import com.protractor.backend.domain.dm.dto.DmDtos.*; import com.protractor.backend.domain.dm.service.DmService; import jakarta.validation.Valid; import jakarta.validation.constraints.*; import java.util.List; import lombok.RequiredArgsConstructor; import org.springframework.http.*; import org.springframework.security.core.Authentication; import org.springframework.validation.annotation.Validated; import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/v1/dms") @RequiredArgsConstructor @Validated
public class DmController {private final DmService service; private Long me(Authentication a){return(Long)a.getPrincipal();}
 @PostMapping public ResponseEntity<RoomResponse> open(Authentication a,@Valid @RequestBody OpenRequest r){return ResponseEntity.status(HttpStatus.CREATED).body(service.open(me(a),r));}
 @GetMapping public List<RoomResponse> list(Authentication a){return service.list(me(a));}
 @PostMapping("/{roomId}/messages") public ResponseEntity<MessageResponse> send(Authentication a,@PathVariable Long roomId,@Valid @RequestBody SendRequest r){return ResponseEntity.status(HttpStatus.CREATED).body(service.send(me(a),roomId,r));}
 @GetMapping("/{roomId}/messages") public MessageListResponse messages(Authentication a,@PathVariable Long roomId,@RequestParam(defaultValue="0")@Min(0)int page,@RequestParam(defaultValue="30")@Min(1)@Max(100)int size){return service.getMessages(me(a),roomId,page,size);}
 @PatchMapping("/{roomId}/read") public ResponseEntity<Void> markRead(Authentication a,@PathVariable Long roomId){service.markRead(me(a),roomId);return ResponseEntity.noContent().build();}}
