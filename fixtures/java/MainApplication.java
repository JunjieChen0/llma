package com.example.demo;

import java.util.List;
import java.util.ArrayList;
import com.example.service.UserService;
import com.example.model.User;

/**
 * 主应用程序入口
 */
public class MainApplication {
    
    private UserService userService;
    
    public static void main(String[] args) {
        System.out.println("Application started");
        MainApplication app = new MainApplication();
        app.run();
    }
    
    public void run() {
        userService = new UserService();
        List<User> users = userService.getAllUsers();
        for (User user : users) {
            System.out.println(user.getName());
        }
    }
}
