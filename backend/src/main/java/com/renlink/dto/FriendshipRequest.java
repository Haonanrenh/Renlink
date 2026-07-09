package com.renlink.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class FriendshipRequest {

    @NotBlank(message = "好友用户名不能为空")
    private String friendUsername;
}
