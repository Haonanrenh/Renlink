package com.renlink;

import com.renlink.util.DotenvLoader;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class RenlinkApplication {
    
    public static void main(String[] args) {
        DotenvLoader.loadIntoSystemProperties();
        SpringApplication.run(RenlinkApplication.class, args);
    }
}
