package com.renlink.repository;

import com.renlink.entity.ChatMessage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {

    List<ChatMessage> findBySenderIdAndReceiverIdOrSenderIdAndReceiverIdOrderByCreatedAtAsc(
        Long senderId1,
        Long receiverId1,
        Long senderId2,
        Long receiverId2
    );

    List<ChatMessage> findBySenderIdAndReceiverIdAndIsReadFalseOrderByCreatedAtAsc(Long senderId, Long receiverId);

    long countByReceiverIdAndIsReadFalse(Long receiverId);

    @Query("""
        select m.senderId as senderId, count(m) as unreadCount
        from ChatMessage m
        where m.receiverId = :receiverId and m.isRead = false
        group by m.senderId
        """)
    List<UnreadMessageCountView> findUnreadCountsBySenderId(@Param("receiverId") Long receiverId);

    interface UnreadMessageCountView {
        Long getSenderId();
        long getUnreadCount();
    }
}
