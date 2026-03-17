using System;

namespace Example.Models
{
    /// <summary>
    /// 狗类 - C# 继承
    /// </summary>
    public class Dog : Animal
    {
        private string breed;
        
        public Dog(string name, int age, string breed) : base(name, age)
        {
            this.breed = breed;
        }
        
        public override void MakeSound()
        {
            Console.WriteLine($"{name} says: Woof! Woof!");
        }
        
        public void Fetch()
        {
            Console.WriteLine($"{name} is fetching the ball");
        }
        
        public string GetBreed() => breed;
    }
}
