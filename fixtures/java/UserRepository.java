package com.example.repository;

import java.util.List;
import java.util.ArrayList;
import com.example.model.User;

/**
 * 用户数据仓库
 */
public class UserRepository {
    
    private List<User> users = new ArrayList<>();
    
    public List<User> findAll() {
        return new ArrayList<>(users);
    }
    
    public User findById(String id) {
        return users.stream()
            .filter(u -> u.getId().equals(id))
            .findFirst()
            .orElse(null);
    }
    
    public void save(User user) {
        users.add(user);
    }
}
