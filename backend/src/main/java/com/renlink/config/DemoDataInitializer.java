package com.renlink.config;

import com.renlink.entity.User;
import com.renlink.repository.UserRepository;
import com.renlink.service.FriendshipService;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Component
@Profile({"dev", "test"})
public class DemoDataInitializer implements CommandLineRunner {

    private static final String DEMO_PASSWORD = "123456";
    private static final List<String> DEMO_USERS = List.of(
        "test1",
        "test2",
        "demoa",
        "demob",
        "democ",
        "demod"
    );

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final FriendshipService friendshipService;

    public DemoDataInitializer(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            FriendshipService friendshipService
    ) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.friendshipService = friendshipService;
    }

    @Override
    @Transactional
    public void run(String... args) {
        Map<String, User> usersByName = DEMO_USERS.stream()
            .map(this::ensureDemoUser)
            .collect(Collectors.toMap(User::getUsername, user -> user));

        ensureFriendship(usersByName, "test1", "test2");
        ensureFriendship(usersByName, "test1", "demoa");
        ensureFriendship(usersByName, "test1", "demob");
        ensureFriendship(usersByName, "test1", "democ");
        ensureFriendship(usersByName, "test2", "demob");
        ensureFriendship(usersByName, "test2", "democ");
        ensureFriendship(usersByName, "test2", "demod");
    }

    private User ensureDemoUser(String username) {
        User user = userRepository.findByUsername(username).orElseGet(User::new);
        user.setUsername(username);
        user.setPassword(passwordEncoder.encode(DEMO_PASSWORD));
        user.setOnline(false);
        user.setLastSeen(LocalDateTime.now());

        if (user.getCreatedAt() == null) {
            user.setCreatedAt(LocalDateTime.now());
        }
        user.setUpdatedAt(LocalDateTime.now());

        return userRepository.save(user);
    }

    private void ensureFriendship(Map<String, User> usersByName, String username, String friendUsername) {
        User user = usersByName.get(username);
        User friend = usersByName.get(friendUsername);
        if (user == null || friend == null) {
            throw new IllegalStateException("演示好友数据初始化失败: " + username + " / " + friendUsername);
        }

        friendshipService.ensureMutualFriendship(user.getId(), friend.getId());
    }
}
