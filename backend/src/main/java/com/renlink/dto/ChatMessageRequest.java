package com.renlink.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ChatMessageRequest {

    @NotBlank(message = "接收方用户名不能为空")
    private String receiverUsername;

    @NotBlank(message = "消息内容不能为空")
    @Size(max = 500, message = "消息内容不能超过 500 个字符")
    private String content;
}
