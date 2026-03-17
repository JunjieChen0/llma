package com.example.service;

import java.util.List;
import java.util.ArrayList;
import com.example.model.User;
import com.example.repository.UserRepository;

/**
 * 用户服务类
 */
public class UserService {
    
    private UserRepository userRepository;
    
    public UserService() {
        this.userRepository = new UserRepository();
    }
    
    public List<User> getAllUsers() {
        return userRepository.findAll();
    }
    
    public User getUserById(String id) {
        return userRepository.findById(id);
    }
    
    public void saveUser(User user) {
        userRepository.save(user);
    }
}
