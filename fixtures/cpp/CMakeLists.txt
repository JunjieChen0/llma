cmake_minimum_required(VERSION 3.20)
project(AnimalFarm VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# 源文件
set(SOURCES
    src/main.cpp
    src/Animal.cpp
    src/Dog.cpp
    src/Cat.cpp
    src/Duck.cpp
)

# 头文件
set(HEADERS
    include/Animal.h
    include/Dog.h
    include/Cat.h
    include/Duck.h
    include/Flyable.h
    include/Swimmable.h
)

# 创建可执行文件
add_executable(animal_farm ${SOURCES} ${HEADERS})

# 包含目录
target_include_directories(animal_farm PRIVATE
    ${CMAKE_SOURCE_DIR}/include
)

# 编译选项
target_compile_options(animal_farm PRIVATE
    $<$<CXX_COMPILER_ID:MSVC>:/W4>
    $<$<NOT:$<CXX_COMPILER_ID:MSVC>>:-Wall -Wextra -Wpedantic>
)

# 安装规则
install(TARGETS animal_farm DESTINATION bin)
