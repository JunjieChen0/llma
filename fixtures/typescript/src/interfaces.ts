/**
 * 可飞行的接口
 */
export interface Flyable {
    fly(): void;
    land(): void;
}

/**
 * 可游泳的接口
 */
export interface Swimmable {
    swim(): void;
}
