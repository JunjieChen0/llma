#ifndef FLYABLE_H
#define FLYABLE_H

#include <string>

/**
 * 可飞行的接口
 */
class Flyable {
public:
    virtual void fly() = 0;
    virtual void land() = 0;
    virtual ~Flyable() = default;
};

#endif // FLYABLE_H
