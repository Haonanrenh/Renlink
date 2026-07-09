package com.renlink.service;

import com.renlink.dto.*;
import com.renlink.entity.User;
import com.renlink.exception.UserAlreadyExistsException;
import com.renlink.exception.UserNotFoundException;
import com.renlink.mapper.UserMapper;
import com.renlink.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Service
public class AuthService {
    
    @Autowired
    private UserRepository userRepository;
    
    @Autowired
    private PasswordEncoder passwordEncoder;
    
    @Autowired
    private JwtService jwtService;
    
    /**
     * 用户登录
     * @param request 登录请求
     * @return 登录响应（包含 Token）
     * @throws BadCredentialsException 用户名或密码错误
     */
    public LoginResponse login(LoginRequest request) {
        User user = userRepository.findByUsername(request.getUsername())
            .orElseThrow(() -> new BadCredentialsException("用户名或密码错误"));
        
        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new BadCredentialsException("用户名或密码错误");
        }
        
        // 设置用户为在线状态
        user.setOnline(true);
        user.setLastSeen(LocalDateTime.now());
        userRepository.save(user);
        
        String token = jwtService.generateToken(user);
        
        return new LoginResponse(true, UserMapper.toDTO(user), token);
    }
    
    /**
     * 用户注册
     * @param request 注册请求
     * @return 注册响应（包含 Token）
     * @throws UserAlreadyExistsException 用户名已存在
     */
    public RegisterResponse register(RegisterRequest request) {
        if (userRepository.existsByUsername(request.getUsername())) {
            throw new UserAlreadyExistsException("用户名已存在");
        }
        
        User user = new User();
        user.setUsername(request.getUsername());
        user.setPassword(passwordEncoder.encode(request.getPassword()));
        user.setOnline(true);  // 注册后立即在线
        user.setLastSeen(LocalDateTime.now());
        user.setCreatedAt(LocalDateTime.now());
        user.setUpdatedAt(LocalDateTime.now());
        
        user = userRepository.save(user);
        
        String token = jwtService.generateToken(user);
        
        return new RegisterResponse(true, UserMapper.toDTO(user), token);
    }
    
    /**
     * 用户登出（可选：将 Token 加入黑名单）
     * @param token JWT Token
     */
    public void logout(String token) {
        // 设置用户为离线状态
        try {
            String username = jwtService.extractUsername(token.replace("Bearer ", ""));
            User user = userRepository.findByUsername(username).orElse(null);
            if (user != null) {
                user.setOnline(false);
                user.setLastSeen(LocalDateTime.now());
                userRepository.save(user);
            }
        } catch (Exception e) {
            // 忽略错误，继续登出
        }
        
        // 可选：实现 Token 黑名单机制
        // tokenBlacklistService.addToBlacklist(token);
    }
    
    /**
     * 获取当前用户信息
     * @param token JWT Token
     * @return 用户信息
     */
    public UserDTO getCurrentUser(String token) {
        String username = jwtService.extractUsername(token);
        User user = userRepository.findByUsername(username)
            .orElseThrow(() -> new UserNotFoundException("用户不存在"));
        return UserMapper.toDTO(user);
    }
}
