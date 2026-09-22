cmake_minimum_required(VERSION 3.22)
project(izcad_native C)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(LIBREDWG_LIBONLY ON CACHE BOOL "" FORCE)
set(ENABLE_LTO OFF CACHE BOOL "" FORCE)
set(BUILD_TESTING OFF CACHE BOOL "" FORCE)
add_subdirectory(${CMAKE_CURRENT_LIST_DIR}/../../../libredwg-src ${CMAKE_CURRENT_BINARY_DIR}/libredwg)
add_library(izcad_native SHARED native_dwg.c)
target_include_directories(izcad_native PRIVATE
    ${CMAKE_CURRENT_LIST_DIR}/../../../libredwg-src/include
    ${CMAKE_CURRENT_LIST_DIR}/../../../libredwg-src/src
    ${CMAKE_CURRENT_BINARY_DIR}/libredwg/src)
target_link_libraries(izcad_native PRIVATE redwg log m)
