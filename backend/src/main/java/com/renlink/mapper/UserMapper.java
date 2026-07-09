package com.renlink.mapper;

import com.renlink.dto.UserDTO;
import com.renlink.entity.User;
import org.springframework.stereotype.Component;

@Component
public class UserMapper {
    
    /**
     * 将 User 实体转换为 UserDTO
     * @param user User 实体
     * @return UserDTO
     */
    public static UserDTO toDTO(User user) {
        if (user == null) {
            return null;
        }
        
        UserDTO dto = new UserDTO();
        dto.setId(user.getId());
        dto.setUsername(user.getUsername());
        dto.setAvatar(user.getAvatar());
        dto.setOnline(user.getOnline());
        dto.setLastSeen(user.getLastSeen());
        dto.setCreatedAt(user.getCreatedAt());
        
        return dto;
    }
    
    /**
     * 将 UserDTO 转换为 User 实体
     * @param dto UserDTO
     * @return User 实体
     */
    public static User toEntity(UserDTO dto) {
        if (dto == null) {
            return null;
        }
        
        User user = new User();
        user.setId(dto.getId());
        user.setUsername(dto.getUsername());
        user.setAvatar(dto.getAvatar());
        user.setLastSeen(dto.getLastSeen());
        user.setCreatedAt(dto.getCreatedAt());
        
        return user;
    }
}
