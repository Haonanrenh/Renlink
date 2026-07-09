package com.renlink.util;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

public final class DotenvLoader {

    private DotenvLoader() {
    }

    public static void loadIntoSystemProperties() {
        Path dotenvPath = findDotenvFile();
        if (dotenvPath == null) {
            return;
        }

        try {
            List<String> lines = Files.readAllLines(dotenvPath, StandardCharsets.UTF_8);
            for (String rawLine : lines) {
                String line = rawLine.trim();
                if (line.isEmpty() || line.startsWith("#")) {
                    continue;
                }

                int separatorIndex = line.indexOf('=');
                if (separatorIndex <= 0) {
                    continue;
                }

                String key = line.substring(0, separatorIndex).trim();
                String value = stripWrappingQuotes(line.substring(separatorIndex + 1).trim());

                if (key.isEmpty()) {
                    continue;
                }

                // 优先级：显式环境变量 > JVM 参数/系统属性 > .env 文件
                if (System.getenv(key) != null || System.getProperty(key) != null) {
                    continue;
                }

                System.setProperty(key, value);
            }
        } catch (IOException e) {
            System.err.println("Failed to load .env file: " + e.getMessage());
        }
    }

    private static Path findDotenvFile() {
        Path[] candidates = new Path[] {
            Paths.get(".env"),
            Paths.get("..", ".env")
        };

        for (Path candidate : candidates) {
            if (Files.exists(candidate) && Files.isRegularFile(candidate)) {
                return candidate.toAbsolutePath().normalize();
            }
        }

        return null;
    }

    private static String stripWrappingQuotes(String value) {
        if (value.length() >= 2) {
            char first = value.charAt(0);
            char last = value.charAt(value.length() - 1);
            if ((first == '"' && last == '"') || (first == '\'' && last == '\'')) {
                return value.substring(1, value.length() - 1);
            }
        }
        return value;
    }
}
