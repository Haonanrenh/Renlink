package com.renlink.service;

import com.renlink.entity.User;
import com.renlink.repository.UserRepository;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;

@Service
public class CurrentUserService {

    private final UserRepository userRepository;

    public CurrentUserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public User requireCurrentUser(Authentication authentication) {
        if (authentication == null || authentication.getName() == null || authentication.getName().isBlank()) {
            throw new IllegalArgumentException("当前用户未认证");
        }

        return userRepository.findByUsername(authentication.getName())
            .orElseThrow(() -> new IllegalArgumentException("当前用户不存在"));
    }
}
