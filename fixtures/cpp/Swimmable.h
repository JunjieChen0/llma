#ifndef SWIMMABLE_H
#define SWIMMABLE_H

/**
 * 可游泳的接口
 */
class Swimmable {
public:
    virtual void swim() = 0;
    virtual ~Swimmable() = default;
};

#endif // SWIMMABLE_H
