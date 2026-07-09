package com.renlink.repository;

import com.renlink.entity.FriendRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface FriendRequestRepository extends JpaRepository<FriendRequest, Long> {

    List<FriendRequest> findByReceiverIdAndStatusOrderByCreatedAtDesc(Long receiverId, String status);

    List<FriendRequest> findByRequesterIdAndStatusOrderByCreatedAtDesc(Long requesterId, String status);

    Optional<FriendRequest> findFirstByRequesterIdAndReceiverIdAndStatusOrderByCreatedAtDesc(
        Long requesterId,
        Long receiverId,
        String status
    );

    Optional<FriendRequest> findByIdAndReceiverIdAndStatus(Long id, Long receiverId, String status);
}
