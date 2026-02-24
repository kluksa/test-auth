package com.example.auth.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/hello")
public class HelloController {

    @GetMapping
    public ResponseEntity<Map<String, Object>> hello(@AuthenticationPrincipal OAuth2User user) {
        return ResponseEntity.ok(Map.of(
            "message", "Hello, " + user.getAttribute("name") + "!",
            "email", user.getAttribute("email"),
            "picture", user.getAttribute("picture")
        ));
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> echo(
            @AuthenticationPrincipal OAuth2User user,
            @RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(Map.of(
            "received", body,
            "from", user.getAttribute("email"),
            "status", "ok"
        ));
    }
}
